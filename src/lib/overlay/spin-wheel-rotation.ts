export function nextSpinWheelRotation(
  currentRotation: number,
  selectedIndex: number,
  sliceCount: number,
  fullTurns = 5,
): number {
  if (sliceCount <= 0) return currentRotation;

  const sliceAngle = 360 / sliceCount;
  const currentAngle = ((currentRotation % 360) + 360) % 360;
  const selectedCenter = ((selectedIndex + 0.5) * sliceAngle) % 360;
  const targetAngle = (360 - selectedCenter) % 360;
  const remainingAngle = (targetAngle - currentAngle + 360) % 360;

  return currentRotation + fullTurns * 360 + remainingAngle;
}
