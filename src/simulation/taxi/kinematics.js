/**
 * Kinematic calculations for taxi motion.
 * Units: metres (m), seconds (s), m/s, m/s^2.
 */

/**
 * Calculates theoretical stopping distance under constant deceleration.
 * d = v^2 / (2 * a)
 * @param {number} speed current speed (m/s)
 * @param {number} braking deceleration rate (m/s^2)
 * @returns {number} stopping distance in metres
 */
export function stoppingDistance(speed, braking) {
  if (braking <= 0 || speed <= 0) return 0;
  return (speed * speed) / (2 * braking);
}
