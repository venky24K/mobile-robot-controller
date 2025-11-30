# Base Controller Joystick - Technical Explanation

## Overview

The base controller joystick is a virtual joystick component that converts user input (mouse/touch) into mecanum wheel speeds for omnidirectional movement. It uses trigonometric calculations to determine the speed of each of the 4 wheels based on the joystick's angle and distance from center.

## Component Architecture

### 1. Joystick Component (`Joystick` function)
Located in `src/App.jsx` (lines 485-708)

**Visual Design:**
- 200px × 200px circular joystick
- Blue border (#007bff) with light gray background
- 45px circular handle that moves with user input
- Visual indicators:
  - 8 directional markers (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
  - 3 concentric circles showing speed zones (33%, 66%, 100%)
  - Real-time display showing speed % and angle when dragging

**Input Methods:**
- Mouse: Click and drag
- Touch: Touch and drag (mobile support)

**State Management:**
- `isDragging`: Whether user is actively controlling joystick
- `position`: Current {x, y} position relative to center
- `currentSpeed`: Display speed (0-100%)

### 2. Input Processing Flow

```
User Input (Mouse/Touch)
    ↓
Calculate position relative to joystick center
    ↓
Calculate distance from center (clamped to max radius)
    ↓
Calculate angle using atan2(y, x) → 0-360°
    ↓
Normalize distance to 0-1 range
    ↓
Call onMove(angle, normalizedDistance)
```

**Key Calculations:**
```javascript
// Position relative to center
x = clientX - centerX
y = clientY - centerY

// Distance from center
distance = √(x² + y²)
maxDistance = (joystickWidth / 2) - 20  // 80px for 200px joystick

// Clamp to max radius
if (distance > maxDistance) {
  x = (x / distance) * maxDistance
  y = (y / distance) * maxDistance
}

// Calculate angle (0-360°)
angle = atan2(y, x) * (180 / π)

// Normalize distance (0-1)
normalizedDistance = min(1, distance / maxDistance)
```

### 3. Mecanum Wheel Kinematics (`handleJoystickMove`)

The core mecanum wheel calculation converts joystick angle and distance into 4 wheel speeds.

**Mecanum Wheel Layout:**
```
    Front
FL ──────── FR
│           │
│    Robot  │
│           │
RL ──────── RR
    Rear
```

**Mathematical Formula:**
For mecanum wheels, each wheel speed is calculated using:
- Front Left:  `sin(angle + 45°) × speed`
- Front Right: `cos(angle + 45°) × speed`
- Rear Left:   `cos(angle + 45°) × speed`
- Rear Right:  `sin(angle + 45°) × speed`

**Code Implementation:**
```javascript
const handleJoystickMove = (angle, distance) => {
  // distance is 0-1 normalized
  const speedFactor = distance * 100; // Convert to 0-100 range
  
  const radians = (angle * Math.PI) / 180;
  
  // Calculate raw wheel speeds
  const frontLeft = Math.sin(radians + Math.PI/4) * speedFactor;
  const frontRight = Math.cos(radians + Math.PI/4) * speedFactor;
  const rearLeft = Math.cos(radians + Math.PI/4) * speedFactor;
  const rearRight = Math.sin(radians + Math.PI/4) * speedFactor;

  // Normalize to prevent exceeding -100 to 100 range
  const maxVal = Math.max(
    Math.abs(frontLeft),
    Math.abs(frontRight),
    Math.abs(rearLeft),
    Math.abs(rearRight),
    1.0
  );

  // Scale to -100 to 100 range
  const scale = 100 / maxVal;
  const speeds = {
    fl: Math.round(frontLeft * scale),
    fr: Math.round(frontRight * scale),
    rl: Math.round(rearLeft * scale),
    rr: Math.round(rearRight * scale)
  };

  // Send to ESP32
  sendBaseCmd(`MECANUM ${speeds.fl} ${speeds.fr} ${speeds.rl} ${speeds.rr}`);
};
```

**Why Normalization?**
The normalization step ensures that no wheel speed exceeds ±100, which is the maximum range the ESP32 expects. Without normalization, certain angles could produce speeds > 100.

**Example Calculations:**

| Joystick Direction | Angle | FL | FR | RL | RR | Movement |
|-------------------|-------|----|----|----|----|----------|
| Forward (Up) | 90° | 71 | 71 | -71 | -71 | Forward |
| Backward (Down) | 270° | -71 | -71 | 71 | 71 | Backward |
| Right | 0° | 71 | -71 | 71 | -71 | Strafe Right |
| Left | 180° | -71 | 71 | -71 | 71 | Strafe Left |
| Forward-Right | 45° | 100 | 0 | 0 | -100 | Diagonal Forward-Right |
| Rotate CW | Special | 100 | -100 | 100 | -100 | Rotate in place |

### 4. Communication with ESP32

**Command Format:**
```
MECANUM <fl> <fr> <rl> <rr>
```

Where each value is -100 to 100:
- Positive: Forward rotation
- Negative: Reverse rotation
- Zero: Stop

**On Release:**
When joystick is released, sends:
```
MECANUM 0 0 0 0
```

This immediately stops all motors.

### 5. Visual Feedback

**During Dragging:**
- Handle changes color (darker blue when active)
- Shows overlay with current speed % and angle
- Handle smoothly follows cursor/finger position
- Visual markers help user understand direction

**On Release:**
- Handle smoothly returns to center (0.2s transition)
- All motors stop
- Speed display disappears

### 6. Touch Support

The joystick fully supports touch devices:
- `handleTouchStart`: Initiates drag
- `handleTouchMove`: Updates position during drag
- `handleTouchEnd`: Releases and stops motors

Uses `touchAction: 'none'` CSS to prevent browser scrolling interference.

## Movement Patterns

### Forward/Backward
- **Forward (90°)**: All wheels rotate forward at equal speeds
- **Backward (270°)**: All wheels rotate backward at equal speeds

### Strafe (Sideways)
- **Right (0°)**: Front and rear wheels rotate in opposite directions
- **Left (180°)**: Front and rear wheels rotate in opposite directions (reversed)

### Diagonal Movement
- **Forward-Right (45°)**: Front-left and rear-right at max speed, others at zero
- **Forward-Left (135°)**: Front-right and rear-left at max speed, others at zero

### Rotation
- **Clockwise**: FL and RL forward, FR and RR backward
- **Counter-clockwise**: FL and RL backward, FR and RR forward

### Combined Movements
Any angle between cardinal directions produces a combination of translation and rotation, allowing smooth omnidirectional movement.

## Technical Details

**Coordinate System:**
- Origin: Center of joystick
- X-axis: Positive right (0°)
- Y-axis: Positive down (90°)
- Angle: Measured counter-clockwise from positive X-axis

**Speed Mapping:**
- Distance from center → Speed (0-100%)
- Edge of joystick = 100% speed
- Center = 0% speed (stopped)

**Clamping:**
- Maximum radius: 80px (for 200px joystick)
- Prevents handle from leaving joystick boundary
- Ensures consistent maximum speed

## Error Handling

- **Connection Lost**: Motors automatically stop on WebSocket disconnect
- **Invalid Commands**: ESP32 validates input and returns error if format is wrong
- **Timeout**: ESP32 stops motors after 10 seconds of no PING

## Performance Considerations

- Uses `useRef` to avoid re-renders during drag
- Event listeners attached only when dragging
- Smooth 60fps updates during mouse/touch movement
- Minimal calculations per frame (trigonometric functions are fast)


