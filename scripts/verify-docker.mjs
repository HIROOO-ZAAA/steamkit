import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");

for (const file of ["Dockerfile", "docker-compose.yml", "nginx.conf", ".dockerignore"]) {
  assert.ok(existsSync(join(root, file)), `${file} is missing`);
}

const dockerfile = read("Dockerfile");
assert.match(dockerfile, /COPY --from=builder \/app\/.next\/standalone \.\//);
assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/health/);
assert.match(dockerfile, /npm prune --omit=dev/);

const compose = read("docker-compose.yml");
for (const service of ["redis:", "web:", "redis-bridge:", "nginx:"]) {
  assert.match(compose, new RegExp(`^  ${service}`, "m"), `${service} service is missing`);
}
assert.match(compose, /redis:\/\/redis:6379/);
assert.match(compose, /condition: service_healthy/);
assert.match(compose, /path: \.env\.production/);

const nginx = read("nginx.conf");
assert.match(nginx, /location = \/health/);
assert.match(nginx, /proxy_pass http:\/\/streamkit_web\/api\/health/);
assert.match(nginx, /proxy_buffering off/);

assert.match(read(".dockerignore"), /\.env\*/);
console.log("Docker configuration checks passed: build, Compose services, health proxy, and secret exclusion.");
