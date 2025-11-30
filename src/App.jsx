import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, RotateCw, Settings, Zap, Bluetooth, BluetoothConnected, BluetoothOff, Gamepad2, Hand } from 'lucide-react';

// --- BLE Configuration ---
const SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

// --- Joystick Configuration ---
const JOYSTICK_RADIUS = 80; // Reduced radius to fit two joysticks

/**
 * Reusable hook for managing a Bluetooth connection.
 */
const useBluetoothController = (deviceName) => {
  const [device, setDevice] = useState(null);
  const [characteristic, setCharacteristic] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  const connect = async () => {
    try {
      setError(null);
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: [SERVICE_UUID]
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const char = await service.getCharacteristic(CHARACTERISTIC_UUID);

      device.addEventListener('gattserverdisconnected', onDisconnected);

      setDevice(device);
      setCharacteristic(char);
      setIsConnected(true);
      console.log(`Connected to ${deviceName}`);
    } catch (err) {
      console.error(`Connection to ${deviceName} failed`, err);
      setError(err.message);
    }
  };

  const disconnect = () => {
    if (device && device.gatt.connected) {
      device.gatt.disconnect();
    }
  };

  const onDisconnected = () => {
    console.log(`Device ${deviceName} disconnected`);
    setIsConnected(false);
    setDevice(null);
    setCharacteristic(null);
  };

  const sendCommand = useCallback(async (cmd) => {
    if (!characteristic) return;
    try {
      const encoder = new TextEncoder();
      await characteristic.writeValue(encoder.encode(cmd));
    } catch (err) {
      console.error(`Send error to ${deviceName}:`, err);
    }
  }, [characteristic, deviceName]);

  return { connect, disconnect, isConnected, sendCommand, error };
};

// Component for the Drag Joystick
const Joystick = ({ setVelocity, label, color = "cyan", sticky = false }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX, clientY) => {
    if (!isDragging && !containerRef.current) return; // Only move if dragging or if it's a sticky joystick and we're initiating a click/touch

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let x = clientX - centerX;
    let y = clientY - centerY;

    let r = Math.sqrt(x * x + y * y);

    if (r > JOYSTICK_RADIUS) {
      x = (x / r) * JOYSTICK_RADIUS;
      y = (y / r) * JOYSTICK_RADIUS;
      r = JOYSTICK_RADIUS;
    }

    setPosition({ x, y });

    // Normalize to -1.0 to 1.0
    const normalizedX = x / JOYSTICK_RADIUS;
    const normalizedY = -y / JOYSTICK_RADIUS; // Invert Y

    setVelocity(normalizedX, normalizedY);
  }, [isDragging, setVelocity]);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    handleMove(clientX, clientY);

  }, [handleMove]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (!sticky) {
      setPosition({ x: 0, y: 0 });
      setVelocity(0, 0);
    }
  }, [setVelocity, sticky]);

  // Global mouse/touch move listeners
  useEffect(() => {
    const mouseMove = (e) => handleMove(e.clientX, e.clientY);
    const touchMove = (e) => handleMove(e.touches[0].clientX, e.touches[0].clientY);

    if (isDragging) {
      window.addEventListener('mousemove', mouseMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', touchMove);
      window.addEventListener('touchend', handleDragEnd);
      window.addEventListener('touchcancel', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchcancel', handleDragEnd);
    };
  }, [isDragging, handleMove, handleDragEnd]);

  const borderColor = color === "cyan" ? "border-cyan-400/50" : "border-purple-400/50";
  const knobColor = color === "cyan" ? "bg-cyan-500/90" : "bg-purple-500/90";

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-gray-400 font-bold text-sm tracking-wider">{label}</div>
      <div
        ref={containerRef}
        className={`relative rounded-full border-4 ${borderColor}
                     bg-gray-800/80 cursor-pointer touch-none shadow-inner shadow-black/50`}
        style={{ width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2 }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        {/* Draggable Knob */}
        <div
          className={`absolute rounded-full w-12 h-12 ${knobColor} shadow-lg shadow-black/50 border-2 border-white/30 transition-all duration-75 ease-linear`}
          style={{
            transform: `translate(${position.x - 24}px, ${position.y - 24}px)`,
            top: '50%',
            left: '50%',
          }}
        >
        </div>
      </div>
    </div>
  );
};

// --- App Component ---
export default function App() {
  // --- Base Controller ---
  const baseBle = useBluetoothController('MecanumRobot');
  const [baseVx, setBaseVx] = useState(0);
  const [baseVy, setBaseVy] = useState(0);
  const [rotationSpeed, setRotationSpeed] = useState(200);

  // --- Arm Controller ---
  const armBle = useBluetoothController('MecanumArm');
  const [armBase, setArmBase] = useState(90);
  const [armExtension, setArmExtension] = useState(0); // 0 = Home (Folded), 100 = Extended (Max)
  const [armWrist, setArmWrist] = useState(110);
  const [armGripper, setArmGripper] = useState(110); // 0 = Closed, 180 = Open (approx)
  const [gripperAction, setGripperAction] = useState('idle'); // 'idle', 'opening', 'closing'

  // Gripper Hold-to-Move Logic
  useEffect(() => {
    if (gripperAction === 'idle') return;

    const interval = setInterval(() => {
      setArmGripper(prev => {
        const step = 2; // Speed: 2 degrees per 50ms
        let next = prev;
        if (gripperAction === 'opening') next += step;
        if (gripperAction === 'closing') next -= step;
        return Math.max(0, Math.min(110, next));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [gripperAction]);

  // Derived Angles for Display
  // Home (0%): Shoulder 0 (UI) -> Servo 180, Elbow 180 (UI) -> Servo 180
  // Max (100%): Shoulder 70 (UI) -> Servo 110, Elbow 70 (UI) -> Servo 70
  const displayShoulder = (armExtension / 100) * 70;
  // Elbow Range: 180 -> 70 (Span of 110 degrees)
  const displayElbow = 180 - ((armExtension / 100) * 110);

  // --- Base Logic ---
  useEffect(() => {
    if (!baseBle.isConnected) return;

    if (Math.abs(baseVx) < 0.05 && Math.abs(baseVy) < 0.05) {
      baseBle.sendCommand(`M:0:0`);
      const stopInterval = setInterval(() => baseBle.sendCommand(`M:0:0`), 50);
      const timeout = setTimeout(() => clearInterval(stopInterval), 500);
      return () => { clearInterval(stopInterval); clearTimeout(timeout); };
    }

    const interval = setInterval(() => {
      baseBle.sendCommand(`M:${baseVx.toFixed(3)}:${baseVy.toFixed(3)}`);
    }, 50);

    return () => clearInterval(interval);
  }, [baseBle.isConnected, baseVx, baseVy, baseBle.sendCommand]);

  const updateRotationSpeed = (value) => {
    setRotationSpeed(value);
    if (baseBle.isConnected) baseBle.sendCommand(`S:${value}`);
  };

  // --- Arm Logic ---
  // State for Arm Joystick Velocity (not Angle)
  const [armVx, setArmVx] = useState(0);
  const [armVy, setArmVy] = useState(0);

  // Refs for State Access inside Loop (to avoid restarting interval)
  const stateRef = useRef({
    armBase, armExtension, armWrist, armGripper, armVx, armVy
  });

  // Sync Refs with State
  useEffect(() => {
    stateRef.current = { armBase, armExtension, armWrist, armGripper, armVx, armVy };
  }, [armBase, armExtension, armWrist, armGripper, armVx, armVy]);

  // Main Control Loop (Runs once, doesn't restart on state changes)
  useEffect(() => {
    if (!armBle.isConnected) return;

    const interval = setInterval(() => {
      const { armBase, armExtension, armWrist, armGripper, armVx, armVy } = stateRef.current;

      // Incremental Control with Variable Speed (Exponential Curve)
      const MAX_SPEED = 8.0;
      // Extension Speed: 0-100 scale. Let's say max speed is 5 units per tick.
      const MAX_EXT_SPEED = 5.0;

      if (Math.abs(armVx) > 0.05 || Math.abs(armVy) > 0.05) {
        // Base Rotation (X-Axis)
        const deltaBase = armVx * Math.abs(armVx) * MAX_SPEED;
        setArmBase(prev => {
          const next = prev + deltaBase;
          return Math.max(0, Math.min(180, next));
        });

        // Arm Extension (Y-Axis) - Coupled Shoulder & Elbow
        // Joystick UP (Negative armVy) -> Increase Extension (Move to Target)
        // Joystick DOWN (Positive armVy) -> Decrease Extension (Move to Home)
        const deltaExt = -armVy * Math.abs(armVy) * MAX_EXT_SPEED;

        setArmExtension(prev => {
          const next = prev + deltaExt;
          return Math.max(0, Math.min(100, next));
        });
      }

      // Calculate Servo Angles from Extension State
      // 1. Shoulder: 0% -> 0 deg (UI), 100% -> 70 deg (UI)
      //    Servo Mapping: 180 - UI Angle
      const uiShoulder = (armExtension / 100) * 70;
      const servoShoulder = 180 - Math.round(uiShoulder);

      // 2. Elbow: 0% -> 180 deg (UI), 100% -> 70 deg (UI)
      //    Range: 180 down to 70 (Span = 110)
      //    Formula: 180 - (Percent * 110)
      const uiElbow = 180 - ((armExtension / 100) * 110);
      const servoElbow = Math.round(uiElbow);

      // Send current angles to robot
      const cmd = `A:${Math.round(armBase)}:${servoShoulder}:${servoElbow}:${armWrist}:${armGripper}`;
      armBle.sendCommand(cmd);

    }, 50); // 20Hz update rate

    return () => clearInterval(interval);
  }, [armBle.isConnected, armBle.sendCommand]); // Only restart if connection changes

  // Handle Arm Joystick now sets Velocity, not Angle
  const handleArmJoystick = (x, y) => {
    setArmVx(x);
    setArmVy(y);
  };

  const constrain = (val, min, max) => Math.min(Math.max(val, min, max));

  const RotationButton = ({ icon, command }) => {
    const handleStart = () => { if (baseBle.isConnected) baseBle.sendCommand(`C:${command}`); };
    const handleStop = () => { if (baseBle.isConnected) baseBle.sendCommand('C:stop'); };
    return (
      <button
        className={`p-4 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-500 shadow-lg transition-all
                    ${!baseBle.isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
        onMouseDown={handleStart} onMouseUp={handleStop}
        onTouchStart={handleStart} onTouchEnd={handleStop}
        disabled={!baseBle.isConnected}
      >
        <span className="text-cyan-400">{icon}</span>
      </button>
    );
  };

  return (
    <div className="w-screen h-screen bg-gray-950 overflow-hidden flex flex-row items-center justify-between px-12 select-none touch-none">

      {/* LEFT: Base Joystick (Clean) */}
      <div className="flex flex-col items-center justify-center w-1/4">
        <Joystick
          label="MOVE"
          color="cyan"
          setVelocity={(vx, vy) => { setBaseVx(vx); setBaseVy(vy); }}
        />
      </div>

      {/* CENTER: Controls & Status */}
      <div className="flex flex-col items-center justify-center w-2/4 h-full py-6 gap-6">

        {/* Top Row: Connections & Speed */}
        <div className="flex items-center gap-6 w-full justify-center bg-gray-900/50 p-3 rounded-2xl border border-gray-800/50">
          <button
            onClick={baseBle.isConnected ? baseBle.disconnect : baseBle.connect}
            className={`p-2 rounded-lg transition-all ${baseBle.isConnected ? 'bg-green-600/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}
          >
            <Gamepad2 className="h-5 w-5" />
          </button>

          {/* Speed Slider */}
          <div className="flex-1 max-w-[120px] flex items-center gap-2">
            <Zap className="h-3 w-3 text-yellow-500" />
            <input
              type="range" min="50" max="255" value={rotationSpeed}
              onChange={(e) => updateRotationSpeed(parseInt(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
            />
          </div>

          <button
            onClick={armBle.isConnected ? armBle.disconnect : armBle.connect}
            className={`p-2 rounded-lg transition-all ${armBle.isConnected ? 'bg-purple-600/20 text-purple-400' : 'bg-gray-800 text-gray-500'}`}
          >
            <Hand className="h-5 w-5" />
          </button>
        </div>

        {/* Middle: Wrist Slider */}
        <div className="w-full max-w-sm bg-gray-900/50 p-4 rounded-2xl border border-gray-800/50">
          <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono tracking-wider">
            <span>WRIST ANGLE</span>
            <span>{armWrist}°</span>
          </div>
          <input
            type="range" min="0" max="110" value={armWrist}
            onChange={(e) => setArmWrist(parseInt(e.target.value))}
            className="w-full h-6 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-400"
          />
        </div>

        {/* Bottom: Rotation & Gripper */}
        <div className="w-full max-w-sm flex gap-4">

          {/* Rotation (Base - Left Side) */}
          <div className="flex gap-2">
            <div className="flex flex-col gap-2">
              <RotationButton icon={<RotateCcw className="h-5 w-5" />} command="rotleft" />
            </div>
            <div className="flex flex-col gap-2">
              <RotationButton icon={<RotateCw className="h-5 w-5" />} command="rotright" />
            </div>
          </div>

          {/* Gripper (Arm - Right Side) */}
          <div className="flex-1 flex gap-2">
            <button
              onMouseDown={() => setGripperAction('closing')}
              onMouseUp={() => setGripperAction('idle')}
              onMouseLeave={() => setGripperAction('idle')}
              onTouchStart={() => setGripperAction('closing')}
              onTouchEnd={() => setGripperAction('idle')}
              className={`flex-1 py-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1
                ${gripperAction === 'closing' ? 'bg-purple-500 text-white shadow-purple-500/50' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
            >
              <span>OPEN</span>
            </button>
            <button
              onMouseDown={() => setGripperAction('opening')}
              onMouseUp={() => setGripperAction('idle')}
              onMouseLeave={() => setGripperAction('idle')}
              onTouchStart={() => setGripperAction('opening')}
              onTouchEnd={() => setGripperAction('idle')}
              className={`flex-1 py-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1
                ${gripperAction === 'opening' ? 'bg-purple-500 text-white shadow-purple-500/50' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
            >
              <span>CLOSE</span>
            </button>
          </div>

        </div>

      </div>

      {/* RIGHT: Arm Joystick */}
      <div className="flex flex-col items-center justify-center w-1/4">
        <Joystick
          label="ARM"
          color="purple"
          setVelocity={handleArmJoystick}
        />
        <div className="mt-4 text-[10px] text-gray-600 font-mono flex gap-3">
          <span>B:{Math.round(armBase)}</span>
          <span>S:{Math.round(displayShoulder)}</span>
          <span>E:{Math.round(displayElbow)}</span>
        </div>
      </div>

    </div>
  );
}