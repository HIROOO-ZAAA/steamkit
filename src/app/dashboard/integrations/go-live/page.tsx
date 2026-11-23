"use client";

import { useState, useEffect } from "react";
import { Send, X, Check, MessageSquare, Hash, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";

type GoLiveEndpoint = {
  id: string;
  platform: "telegram" | "discord";
  endpoint_id: string;
  endpoint_hash: string;
  is_active: boolean;
  message_template: string;
  created_at: string;
  // Joined data
  endpoint_name?: string;
  endpoint_ref?: string;
};

const platformIcons = {
  telegram: MessageSquare,
  discord: Hash,
};

const platformLabels = {
  telegram: "Telegram Group",
  discord: "Discord Webhook",
};

export default function GoLivePage() {
  const [supabase] = useState(() => createClient());
  const [endpoints, setEndpoints] = useState<GoLiveEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formPlatform, setFormPlatform] = useState<"telegram" | "discord">("telegram");
  const [formEndpointId, setFormEndpointId] = useState("");
  const [formMessageTemplate, setFormMessageTemplate] = useState(
    "🔴 **{creator} is now LIVE!**\n\n{title}\n\n🎮 {game}\n\n🔗 {url}",
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [telegramGroups, setTelegramGroups] = useState<{ id: string; group_name: string; telegram_chat_title?: string }[]>([]);
  const [discordWebhooks, setDiscordWebhooks] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("Not signed in");
          setLoading(false);
          return;
        }

        // Load endpoints
        const { data: eps, error: epError } = await supabase.rpc("streamkit_get_go_live_endpoints", {
          p_creator_id: user.id,
        });

        if (epError) throw epError;
        setEndpoints(eps ?? []);

        // Load available telegram groups
        const { data: tgGroups } = await supabase
          .from("telegram_groups")
          .select("id, group_name, telegram_chat_title")
          .eq("creator_id", user.id)
          .eq("status", "active");
        setTelegramGroups(tgGroups ?? []);

        // Load available discord webhooks
        const { data: dcWebhooks } = await supabase
          .from("webhook_endpoints")
          .select("id, name")
          .eq("is_active", true);
        setDiscordWebhooks(dcWebhooks ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Hash the endpoint reference for privacy
      const encoder = new TextEncoder();
      const keyData = encoder.encode(process.env.NEXT_PUBLIC_APP_URL ?? "streamkit-go-live");
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const hashBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(formEndpointId));
      const endpointHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase.rpc("streamkit_upsert_go_live_endpoint", {
        p_platform: formPlatform,
        p_endpoint_id: formEndpointId,
        p_endpoint_hash: endpointHash,
        p_message_template: formMessageTemplate,
      });

      if (error) throw error;

      setMessage({ text: "Go-live endpoint saved!", tone: "success" });
      setShowForm(false);
      setFormEndpointId("");
      setFormMessageTemplate(
        "🔴 **{creator} is now LIVE!**\n\n{title}\n\n🎮 {game}\n\n🔗 {url}",
      );

      // Reload
      const { data: eps } = await supabase.rpc("streamkit_get_go_live_endpoints", {
        p_creator_id: user.id,
      });
      setEndpoints(eps ?? []);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(endpointId: string) {
    setMessage(null);
    try {
      const { error } = await supabase.rpc("streamkit_deactivate_go_live_endpoint", {
        p_endpoint_id: endpointId,
      });
      if (error) throw error;
      setMessage({ text: "Endpoint deactivated", tone: "success" });
      setEndpoints((prev) =>
        prev.map((ep) => (ep.id === endpointId ? { ...ep, is_active: false } : ep)),
      );
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to deactivate", tone: "error" });
    }
  }

  async function handleTestAnnounce() {
    setMessage(null);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const res = await fetch("/api/go-live/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: user.id,
          title: "Test Stream",
          game: "Just Chatting",
          url: window.location.origin,
          creatorName: user.user_metadata?.full_name ?? "Test Creator",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send test");
      setMessage({ text: `Test announcement sent to ${data.sent} endpoint(s)`, tone: "success" });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to send test", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  function openTelegramSettings() {
    window.open("/dashboard/telegram", "_blank");
  }

  function openDiscordSettings() {
    // Webhook endpoints are platform-level; only admins can manage them.
    // Link to the settings page where they can be configured if user has access.
    window.open("/dashboard/settings", "_blank");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500" role="alert">
        {error}
      </div>
    );
  }

  const telegramEndpoints = endpoints.filter((e) => e.platform === "telegram");
  const discordEndpoints = endpoints.filter((e) => e.platform === "discord");

  const availableTelegramGroups = telegramGroups.filter(
    (g) => !telegramEndpoints.some((ep) => ep.endpoint_id === g.id),
  );
  const availableDiscordWebhooks = discordWebhooks.filter(
    (w) => !discordEndpoints.some((ep) => ep.endpoint_id === w.id),
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <PageHeader
        title="Go-Live Announcements"
        description="Automatically notify your community when you go live via Telegram groups and Discord webhooks."
        actions={
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Send className="h-4 w-4" /> Add Endpoint
          </button>
        }
      />

      {message && (
        <div
          className={`p-4 rounded-lg flex items-center gap-3 ${
            message.tone === "success" ? "bg-green-900/30 text-green-300 border border-green-700" : "bg-red-900/30 text-red-300 border border-red-700"
          }`}
          role="alert"
        >
          <Check className="h-5 w-5 flex-shrink-0" />
          {message.text}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Telegram Section */}
        <section className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <MessageSquare className="h-5 w-5 text-blue-400" />
              Telegram Groups
            </h2>
            <button
              onClick={openTelegramSettings}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Manage groups →
            </button>
          </div>

          {telegramEndpoints.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No Telegram groups connected for go-live announcements.</p>
              <p className="text-sm mt-1">Add a group below to start sending live notifications.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {telegramEndpoints.map((ep) => (
                <div
                  key={ep.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    ep.is_active
                      ? "border-slate-700 bg-slate-800/50"
                      : "border-slate-800 bg-slate-900/50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="font-medium text-white">
                        {ep.endpoint_ref || ep.endpoint_name || `Group ${ep.endpoint_id.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-slate-400">Telegram group</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        ep.is_active ? "bg-green-900/30 text-green-300" : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {ep.is_active ? "Active" : "Inactive"}
                    </span>
                    {ep.is_active && (
                      <button
                        onClick={() => handleDeactivate(ep.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                        aria-label="Deactivate endpoint"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {availableTelegramGroups.length > 0 && (
            <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
              <p className="text-sm text-blue-300 mb-2">
                Available groups not yet used for go-live:
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTelegramGroups.map((g) => (
                  <span
                    key={g.id}
                    className="px-3 py-1 text-sm bg-blue-900/30 border border-blue-700 rounded-full text-blue-200"
                  >
                    {g.telegram_chat_title || g.group_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Discord Section */}
        <section className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Hash className="h-5 w-5 text-purple-400" />
              Discord Webhooks
            </h2>
            <button
              onClick={openDiscordSettings}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Manage webhooks →
            </button>
          </div>

          {discordEndpoints.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Hash className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No Discord webhooks configured for go-live announcements.</p>
              <p className="text-sm mt-1">Add a webhook below to start sending live notifications.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {discordEndpoints.map((ep) => (
                <div
                  key={ep.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    ep.is_active
                      ? "border-slate-700 bg-slate-800/50"
                      : "border-slate-800 bg-slate-900/50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Hash className="h-5 w-5 text-purple-400" />
                    <div>
                      <p className="font-medium text-white">
                        {ep.endpoint_name || `Webhook ${ep.endpoint_id.slice(0, 8)}`}
                      </p>
                      <p className="text-sm text-slate-400">Discord webhook</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        ep.is_active ? "bg-green-900/30 text-green-300" : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {ep.is_active ? "Active" : "Inactive"}
                    </span>
                    {ep.is_active && (
                      <button
                        onClick={() => handleDeactivate(ep.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                        aria-label="Deactivate endpoint"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {availableDiscordWebhooks.length > 0 && (
            <div className="mt-4 p-4 bg-purple-900/20 border border-purple-800 rounded-lg">
              <p className="text-sm text-purple-300 mb-2">
                Available webhooks not yet used for go-live:
              </p>
              <div className="flex flex-wrap gap-2">
                {availableDiscordWebhooks.map((w) => (
                  <span
                    key={w.id}
                    className="px-3 py-1 text-sm bg-purple-900/30 border border-purple-700 rounded-full text-purple-200"
                  >
                    {w.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Template Variables Help */}
      <section className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Message Template Variables</h3>
        <p className="text-slate-300 mb-4">
          Use these placeholders in your custom message template. They will be replaced when the announcement is sent.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <code className="px-3 py-2 bg-slate-800 rounded-lg text-blue-300">{`{creator}`}</code>
          <p className="text-slate-400">Streamer&apos;s display name</p>
          <code className="px-3 py-2 bg-slate-800 rounded-lg text-blue-300">{`{title}`}</code>
          <p className="text-slate-400">Stream title</p>
          <code className="px-3 py-2 bg-slate-800 rounded-lg text-blue-300">{`{game}`}</code>
          <p className="text-slate-400">Game/category being played</p>
          <code className="px-3 py-2 bg-slate-800 rounded-lg text-blue-300">{`{url}`}</code>
          <p className="text-slate-400">Stream URL</p>
        </div>
      </section>

      {/* Add Endpoint Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-white mb-6">Add Go-Live Endpoint</h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Platform</label>
                <div className="grid grid-cols-2 gap-3">
                  {(["telegram", "discord"] as const).map((p) => {
                    const Icon = platformIcons[p];
                    const Label = platformLabels[p];
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setFormPlatform(p)}
                        className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                          formPlatform === p
                            ? "border-blue-500 bg-blue-900/30 text-blue-200"
                            : "border-slate-700 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Icon className="h-4 w-4" />
                          {Label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {formPlatform === "telegram" ? "Telegram Group" : "Discord Webhook"}
                </label>
                <select
                  value={formEndpointId}
                  onChange={(e) => setFormEndpointId(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {formPlatform === "telegram"
                    ? telegramGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.telegram_chat_title || g.group_name}
                        </option>
                      ))
                    : discordWebhooks.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                </select>
                {(formPlatform === "telegram" ? availableTelegramGroups : availableDiscordWebhooks).length === 0 && (
                  <p className="text-sm text-slate-500 mt-1">
                    No available {formPlatform === "telegram" ? "groups" : "webhooks"}.{" "}
                    <button
                      type="button"
                      onClick={formPlatform === "telegram" ? openTelegramSettings : openDiscordSettings}
                      className="text-blue-400 hover:underline"
                    >
                      Add one first
                    </button>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Message Template</label>
                <textarea
                  value={formMessageTemplate}
                  onChange={(e) => setFormMessageTemplate(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                  placeholder="🔴 **{creator} is now LIVE!**\n\n{title}\n\n🎮 {game}\n\n🔗 {url}"
                />
              </div>

              {formError && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formEndpointId}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Endpoint"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Button */}
      {(telegramEndpoints.length > 0 || discordEndpoints.length > 0) && (
        <div className="border-t border-slate-700 pt-6">
          <button
            onClick={handleTestAnnounce}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
            {saving ? "Sending test..." : "Send Test Announcement"}
          </button>
          <p className="text-sm text-slate-500 mt-2">
            Sends a test announcement to all active endpoints using your saved templates.
          </p>
        </div>
      )}
    </div>
  );
}