# Pinout Reference

## Base ESP32 - Mecanum Wheel Controller

### Motor Connections (L298N or similar dual H-bridge)

| Motor | IN1 Pin | IN2 Pin | EN Pin | GPIO |
|-------|---------|---------|--------|------|
| Front Left (M1)  | M1_IN1  | M1_IN2  | M1_EN  | 16, 17, 4 |
| Front Right (M2) | M2_IN1  | M2_IN2  | M2_EN  | 27, 26, 25 |
| Rear Left (M3)   | M3_IN1  | M3_IN2  | M3_EN  | 22, 21, 32 |
| Rear Right (M4)  | M4_IN1  | M4_IN2  | M4_EN  | 19, 18, 5 |

### Motor Driver Wiring (L298N)

```
ESP32          L298N Motor Driver
------         ------------------
GPIO 16  --->  M1 IN1 (Front Left)
GPIO 17  --->  M1 IN2 (Front Left)
GPIO 4   --->  M1 ENA (Front Left Enable/PWM)

GPIO 27  --->  M2 IN1 (Front Right)
GPIO 26  --->  M2 IN2 (Front Right)
GPIO 25  --->  M2 ENB (Front Right Enable/PWM)

GPIO 22  --->  M3 IN1 (Rear Left)
GPIO 21  --->  M3 IN2 (Rear Left)
GPIO 32  --->  M3 ENC (Rear Left Enable/PWM)

GPIO 19  --->  M4 IN1 (Rear Right)
GPIO 18  --->  M4 IN2 (Rear Right)
GPIO 5   --->  M4 END (Rear Right Enable/PWM)

Direction Control:
- Forward: IN1=HIGH, IN2=LOW
- Reverse: IN1=LOW, IN2=HIGH
- Stop: IN1=LOW, IN2=LOW
- Speed: Controlled by PWM on EN pin
```

**Note**: Adjust pins in `esp32_base.ino` based on your motor driver setup.

---

## Arm ESP32 - 4 DOF Arm Controller

### Servo Connections

| Servo | GPIO Pin | Function |
|-------|----------|----------|
| Base     | 2  | Base rotation (0-180°) |
| Shoulder | 4  | Shoulder joint (0-180°) |
| Elbow    | 5  | Elbow joint (0-180°) |
| Wrist    | 18 | Wrist rotation (0-180°) |
| Gripper  | 19 | End effector (0-180°) |

### Servo Wiring

```
ESP32          Servo
------         -----
GPIO 2   --->  Base Servo Signal (Yellow/Orange)
GPIO 4   --->  Shoulder Servo Signal
GPIO 5   --->  Elbow Servo Signal
GPIO 18  --->  Wrist Servo Signal
GPIO 19  --->  Gripper Servo Signal

Power:
- All servos Red wire → 5V (external power supply recommended)
- All servos Black wire → GND (common ground with ESP32)
```

**Important**: 
- Use external 5V power supply for servos (ESP32 can't power multiple servos)
- Connect ESP32 GND to servo power supply GND
- Signal wires (yellow/orange) connect to GPIO pins

---

## Alternative Pin Configurations

If you need to change pins, edit the pin definitions at the top of each `.ino` file:

### Base Controller:
```cpp
const int M1_IN1 = 16;  // Front Left IN1
const int M1_IN2 = 17;  // Front Left IN2
const int M1_EN = 4;    // Front Left Enable/PWM
// ... etc
```

### Arm Controller:
```cpp
const int SERVO_BASE = 2;     // Change these
const int SERVO_SHOULDER = 4;
// ... etc
```

## GPIO Pin Notes (ESP32)

- **Avoid using**: GPIO 0, 1, 3 (used for programming/debugging)
- **Good for PWM**: Most GPIO pins support PWM
- **Good for servos**: GPIO 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33
- **Input only**: GPIO 34, 35, 36, 39 (no output capability)

