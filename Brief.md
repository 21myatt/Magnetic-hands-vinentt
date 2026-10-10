Create a visually polished, interactive hand-tracking experience using a webcam and a 3D scene.

## Core Interaction

Objects are not directly grabbed. Instead, they react to the user's hand through an invisible force field, creating the illusion that the hand can manipulate the physical properties of nearby objects.

**Interaction sequence:**

1. **Approach:** As the user's hand moves toward an object, it begins responding to an invisible attraction force. It subtly rotates, trembles, or drifts toward the hand.
2. **Proximity:** As the hand gets closer, the attraction intensifies. The object accelerates toward the palm, leaving a subtle particle trail or distortion effect.
3. **Palm:** Detect a Palm gesture using hand landmarks. The object locks into an unstable orbit around the hand, accompanied by a satisfying visual and motion response.
4. **Release:** When the user releases the pinch and showing fist gesture, the object launches according to its accumulated velocity and personality. Trigger a satisfying burst of particles, a shockwave, or a deformation effect. Display `BOOM`.

## Object Personalities

Each object must feel physically different, not merely look different.

- **Heavy Cube:** Resists attraction, moves slowly, and creates a weighty impact when released.
- **Feather:** Drifts effortlessly, floats past the hand, and responds to subtle air currents.
- **Magnet:** Snaps aggressively toward the hand with sudden acceleration and a brief magnetic field effect.
- **Slime:** Stretches elastically toward the hand, deforms under tension, and snaps back when released.
- **Balloon:** Resists downward motion, floats upward, and attempts to escape the attraction field.

## Visual Direction

Use minimal geometric objects against a clean, dark or neutral background. Make the motion and materials the visual centerpiece.

Use procedural shaders, subtle glow, particles, elastic deformation, motion trails, and responsive lighting. Avoid excessive UI, decorative elements, and unnecessary complexity.

The experience should feel tactile, playful, and slightly magical, with each interaction delivering immediate visual feedback.

## Technical Requirements

- Use webcam-based hand tracking and real-time hand landmarks.
- Map hand position into the 3D scene smoothly, avoiding jitter.
- Use proximity-based attraction with adjustable force, falloff, damping, and maximum velocity.
- Detect pinch and release gestures reliably, with smoothing and hysteresis to prevent flickering.
- Give every object a distinct physics behavior through configurable parameters.
- Maintain stable frame rates and ensure that all interactions work in real time.
- Use simple geometry and procedural effects wherever possible instead of expensive simulations.

## Success Criteria

The experience should be understandable without instructions within the first few seconds.

Users should naturally experiment with moving their hands closer, pinching, and releasing objects just to discover how each object behaves.

**The key design principle: the user controls invisible forces, not objects directly.** The illusion of physical interaction should make even simple geometric objects feel alive.
