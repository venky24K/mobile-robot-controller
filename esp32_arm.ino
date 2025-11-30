/*
 * ESP32 4 DOF Arm Controller
 * WebSocket server for controlling 4 servos + 1 end effector
 * 
 * Commands:
 * - AUTH:<token> - Authentication
 * - PING - Heartbeat
 * - ARM <base> <shoulder> <elbow> <wrist> <gripper> - Set servo angles (0-180)
 * 
 * Pin Configuration:
 * - Servo 0 (Base):     GPIO 2
 * - Servo 1 (Shoulder): GPIO 4
 * - Servo 2 (Elbow):    GPIO 5
 * - Servo 3 (Wrist):    GPIO 18
 * - Servo 4 (Gripper):  GPIO 19
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPAsyncWebServer.h>
#include <ESP32Servo.h>

// WiFi credentials
const char* ssid = "RobotArm";
const char* password = "robot1234";
const char* authToken = "mysecret";

// WebSocket server
WebSocketsServer webSocket = WebSocketsServer(81);
AsyncWebServer server(80);

// Servo pins
const int SERVO_BASE = 2;
const int SERVO_SHOULDER = 4;
const int SERVO_ELBOW = 5;
const int SERVO_WRIST = 18;
const int SERVO_GRIPPER = 19;

// Servo objects
Servo servoBase;
Servo servoShoulder;
Servo servoElbow;
Servo servoWrist;
Servo servoGripper;

// Current servo positions
int servoPositions[5] = {90, 90, 90, 90, 90};

bool authenticated = false;
unsigned long lastPing = 0;
const unsigned long PING_TIMEOUT = 10000; // 10 seconds

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Setup servos
  setupServos();

  // Setup WiFi
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password);
  IPAddress IP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(IP);

  // WebSocket event handler
  webSocket.onEvent(webSocketEvent);
  webSocket.begin();

  // HTTP server for status
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/html", 
      "<html><body><h1>ESP32 4 DOF Arm</h1><p>WebSocket on port 81</p></body></html>");
  });
  server.begin();

  // Move to home position
  moveToHome();
  
  Serial.println("4 DOF Arm Controller Ready!");
  Serial.println("Connect to WebSocket at ws://" + IP.toString() + ":81");
}

void loop() {
  webSocket.loop();

  // Check for timeout
  if (authenticated && (millis() - lastPing > PING_TIMEOUT)) {
    Serial.println("Connection timeout");
    authenticated = false;
  }
}

void setupServos() {
  // Allow allocation of all timers
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // Attach servos with default 50Hz frequency
  servoBase.attach(SERVO_BASE, 500, 2500);      // Base rotation
  servoShoulder.attach(SERVO_SHOULDER, 500, 2500); // Shoulder
  servoElbow.attach(SERVO_ELBOW, 500, 2500);    // Elbow
  servoWrist.attach(SERVO_WRIST, 500, 2500);     // Wrist
  servoGripper.attach(SERVO_GRIPPER, 500, 2500); // Gripper

  // Initialize to home position
  moveToHome();
}

void moveToHome() {
  servoPositions[0] = 90; // Base
  servoPositions[1] = 90; // Shoulder
  servoPositions[2] = 90; // Elbow
  servoPositions[3] = 90; // Wrist
  servoPositions[4] = 90; // Gripper

  servoBase.write(servoPositions[0]);
  servoShoulder.write(servoPositions[1]);
  servoElbow.write(servoPositions[2]);
  servoWrist.write(servoPositions[3]);
  servoGripper.write(servoPositions[4]);

  Serial.println("Moved to home position");
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected\n", num);
      authenticated = false;
      break;

    case WStype_CONNECTED:
      {
        IPAddress ip = webSocket.remoteIP(num);
        Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
        authenticated = false;
      }
      break;

    case WStype_TEXT:
      {
        String message = String((char*)payload);
        Serial.printf("[%u] Received: %s\n", num, message.c_str());
        
        // Handle authentication
        if (message.startsWith("AUTH:")) {
          String token = message.substring(5);
          if (token == authToken) {
            authenticated = true;
            lastPing = millis();
            webSocket.sendTXT(num, "AUTH_OK");
            Serial.println("Authentication successful");
          } else {
            webSocket.sendTXT(num, "AUTH_FAIL");
            Serial.println("Authentication failed");
          }
          return;
        }

        // Check authentication
        if (!authenticated) {
          webSocket.sendTXT(num, "NOT_AUTHENTICATED");
          return;
        }

        // Handle PING
        if (message == "PING") {
          lastPing = millis();
          webSocket.sendTXT(num, "PONG");
          return;
        }

        // Handle ARM command
        if (message.startsWith("ARM ")) {
          int base, shoulder, elbow, wrist, gripper;
          if (sscanf(message.c_str(), "ARM %d %d %d %d %d", &base, &shoulder, &elbow, &wrist, &gripper) == 5) {
            // Clamp values to 0-180
            base = constrain(base, 0, 180);
            shoulder = constrain(shoulder, 0, 180);
            elbow = constrain(elbow, 0, 180);
            wrist = constrain(wrist, 0, 180);
            gripper = constrain(gripper, 0, 180);

            // Update positions
            servoPositions[0] = base;
            servoPositions[1] = shoulder;
            servoPositions[2] = elbow;
            servoPositions[3] = wrist;
            servoPositions[4] = gripper;

            // Move servos smoothly
            moveServo(servoBase, servoPositions[0]);
            moveServo(servoShoulder, servoPositions[1]);
            moveServo(servoElbow, servoPositions[2]);
            moveServo(servoWrist, servoPositions[3]);
            moveServo(servoGripper, servoPositions[4]);

            webSocket.sendTXT(num, "OK");
            Serial.printf("Arm: Base=%d, Shoulder=%d, Elbow=%d, Wrist=%d, Gripper=%d\n",
              base, shoulder, elbow, wrist, gripper);
          } else {
            webSocket.sendTXT(num, "ERROR: Invalid format");
          }
          return;
        }

        webSocket.sendTXT(num, "UNKNOWN_COMMAND");
      }
      break;

    default:
      break;
  }
}

void moveServo(Servo &servo, int targetAngle) {
  // Direct movement for faster response
  // For smoother movement, you can add interpolation here
  servo.write(targetAngle);
}

