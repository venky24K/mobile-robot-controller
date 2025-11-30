#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- HARDWARE PIN DEFINITIONS ---
const int M1_IN1 = 16;
const int M1_IN2 = 17;
const int M1_EN = 4;
const int M2_IN1 = 27;
const int M2_IN2 = 26;
const int M2_EN = 25;
const int M3_IN1 = 22;
const int M3_IN2 = 21;
const int M3_EN = 32;
const int M4_IN1 = 19;
const int M4_IN2 = 18;
const int M4_EN = 5;

// --- PWM CONFIGURATION (ESP32 Core 3.x) ---
const int PWM_FREQ = 1000;
const int PWM_RESOLUTION = 8; // 0-255 range
const int MAX_SPEED = (1 << PWM_RESOLUTION) - 1; // 255 

// --- BLE CONFIGURATION ---
#define SERVICE_UUID        "0000FFE0-0000-1000-8000-00805F9B34FB"
#define CHARACTERISTIC_UUID "0000FFE1-0000-1000-8000-00805F9B34FB"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

int rotationSpeed = 180; 

// --- MOTOR CONTROL FUNCTIONS ---

void setMotor(int in1, int in2, int enPin, int speed) {
  speed = constrain(speed, -MAX_SPEED, MAX_SPEED);
  
  if (speed > 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
    ledcWrite(enPin, speed);
  } else if (speed < 0) {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
    ledcWrite(enPin, abs(speed));
  } else { 
    digitalWrite(in1, LOW);
    digitalWrite(in2, LOW);
    ledcWrite(enPin, 0);
  }
}

void stopMotors() {
  setMotor(M1_IN1, M1_IN2, M1_EN, 0);
  setMotor(M2_IN1, M2_IN2, M2_EN, 0);
  setMotor(M3_IN1, M3_IN2, M3_EN, 0);
  setMotor(M4_IN1, M4_IN2, M4_EN, 0);
}

// --- MECANUM CONTINUOUS MOVEMENT (INVERSE KINEMATICS) ---

void moveXY(float vx, float vy) {
  float speed_fl = vy + vx;
  float speed_fr = vy - vx;
  float speed_rl = vy - vx;
  float speed_rr = vy + vx;

  float max_required = max(max(fabs(speed_fl), fabs(speed_fr)), max(fabs(speed_rl), fabs(speed_rr)));
  
  float scale = (max_required > 1.0) ? (1.0 / max_required) : 1.0;
  
  int pwm_fl = round(speed_fl * scale * MAX_SPEED);
  int pwm_fr = round(speed_fr * scale * MAX_SPEED);
  int pwm_rl = round(speed_rl * scale * MAX_SPEED);
  int pwm_rr = round(speed_rr * scale * MAX_SPEED);
  
  setMotor(M1_IN1, M1_IN2, M1_EN, pwm_fl);
  setMotor(M2_IN1, M2_IN2, M2_EN, pwm_fr);
  setMotor(M3_IN1, M3_IN2, M3_EN, pwm_rl);
  setMotor(M4_IN1, M4_IN2, M4_EN, pwm_rr);
}

// --- ROTATION CONTROL (Discrete commands) ---

void rotateLeft() {
  setMotor(M1_IN1, M1_IN2, M1_EN, rotationSpeed);
  setMotor(M2_IN1, M2_IN2, M2_EN, -rotationSpeed);
  setMotor(M3_IN1, M3_IN2, M3_EN, rotationSpeed);
  setMotor(M4_IN1, M4_IN2, M4_EN, -rotationSpeed);
}

void rotateRight() {
  setMotor(M1_IN1, M1_IN2, M1_EN, -rotationSpeed);
  setMotor(M2_IN1, M2_IN2, M2_EN, rotationSpeed);
  setMotor(M3_IN1, M3_IN2, M3_EN, -rotationSpeed);
  setMotor(M4_IN1, M4_IN2, M4_EN, rotationSpeed);
}

// --- BLE CALLBACKS ---

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device Connected");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device Disconnected");
      stopMotors(); // Safety stop
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue().c_str();

      if (value.length() > 0) {
        Serial.print("Received: ");
        Serial.println(value);

        // Protocol:
        // M:vx:vy  (Move)
        // C:cmd    (Control - rotleft, rotright, stop)
        // S:val    (Speed)

        if (value.startsWith("M:")) {
          int firstColon = value.indexOf(':');
          int secondColon = value.indexOf(':', firstColon + 1);
          
          if (firstColon != -1 && secondColon != -1) {
            String vxStr = value.substring(firstColon + 1, secondColon);
            String vyStr = value.substring(secondColon + 1);
            
            float vx = vxStr.toFloat();
            float vy = vyStr.toFloat();
            
            if (fabs(vx) < 0.05 && fabs(vy) < 0.05) {
              stopMotors();
            } else {
              moveXY(vx, vy);
            }
          }
        } 
        else if (value.startsWith("C:")) {
          String cmd = value.substring(2);
          if (cmd == "rotleft") rotateLeft();
          else if (cmd == "rotright") rotateRight();
          else if (cmd == "stop") stopMotors();
        }
        else if (value.startsWith("S:")) {
          int val = value.substring(2).toInt();
          rotationSpeed = constrain(val, 50, MAX_SPEED);
        }
      }
    }
};

// --- SETUP AND LOOP ---

void setup() {
  Serial.begin(115200);
  
  // --- Pin Configuration ---
  pinMode(M1_IN1, OUTPUT);
  pinMode(M1_IN2, OUTPUT);
  pinMode(M2_IN1, OUTPUT);
  pinMode(M2_IN2, OUTPUT);
  pinMode(M3_IN1, OUTPUT);
  pinMode(M3_IN2, OUTPUT);
  pinMode(M4_IN1, OUTPUT);
  pinMode(M4_IN2, OUTPUT);
  
  // --- LEDC (PWM) Setup - ESP32 Core 3.x ---
  ledcAttach(M1_EN, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(M2_EN, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(M3_EN, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(M4_EN, PWM_FREQ, PWM_RESOLUTION);
  
  // --- BLE Setup ---
  BLEDevice::init("MecanumRobot");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->setCallbacks(new MyCallbacks());
  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // functions that help with iPhone connections issue
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE Ready! Waiting for connections...");
  
  stopMotors();
}

void loop() {
  // Disconnection handling
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); // Give the bluetooth stack the chance to get things ready
      pServer->startAdvertising(); // Restart advertising
      Serial.println("Start advertising");
      oldDeviceConnected = deviceConnected;
  }
  // Connection handling
  if (deviceConnected && !oldDeviceConnected) {
      // do stuff here on connecting
      oldDeviceConnected = deviceConnected;
  }
}