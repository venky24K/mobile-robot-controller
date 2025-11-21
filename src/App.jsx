import React, { useEffect, useRef, useState } from 'react';

export default function App() {
  const [ip, setIp] = useState('192.168.4.1'); // default ESP AP IP fallback
  const [port, setPort] = useState('81');
  const [token, setToken] = useState('mysecret');
  const [connected, setConnected] = useState(false);
  const [lastMsg, setLastMsg] = useState('');
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  function connect() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const url = `ws://${ip}:${port}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setConnected(true);
      // send simple auth handshake
      ws.send(`AUTH:${token}`);
      // start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING');
      }, 5000);
    };

    ws.onmessage = (evt) => {
      setLastMsg(evt.data);
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // exponential backoff reconnect
      retryRef.current = Math.min(10, retryRef.current + 1);
      const delay = 500 * Math.pow(2, retryRef.current);
      setTimeout(() => connect(), delay);
    };

    ws.onerror = (e) => {
      console.error('WS error', e);
      ws.close();
    };
  }

  function disconnect() {
    if (wsRef.current) wsRef.current.close();
    setConnected(false);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
  }

  function sendCmd(cmd) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd);
      setLastMsg(`SENT: ${cmd}`);
    } else {
      setLastMsg('WS not open');
    }
  }

  // simple control helpers
  const move = (dir, speed = 100) => sendCmd(`MOVE ${dir} ${speed}`);
  const stop = () => sendCmd('STOP');

  // joystick control
  const handleJoystickMove = (direction, distance) => {
    const speed = Math.min(100, Math.round(distance * 2)); // max speed 100, based on drag distance
    move(direction, speed);
  };

  const handleJoystickRelease = () => {
    stop();
  };

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif',padding:20,maxWidth:720,margin:'0 auto'}}>
      <h1 style={{marginBottom:6}}>ESP32 Robot — React Controller</h1>
      <p style={{color:'#555',marginTop:0}}>Connect via WebSocket (recommended). Enter ESP IP and port, then Connect.</p>

      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input value={ip} onChange={e=>setIp(e.target.value)} placeholder="ESP IP (or myrobot.local)" />
        <input value={port} onChange={e=>setPort(e.target.value)} style={{width:80}} />
        <input value={token} onChange={e=>setToken(e.target.value)} placeholder="auth token" style={{width:160}} />
        {!connected ? (
          <button onClick={connect}>Connect</button>
        ) : (
          <button onClick={disconnect}>Disconnect</button>
        )}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div style={{padding:12,border:'1px solid #eee',borderRadius:8}}>
          <h3>Joystick Control</h3>
          <Joystick onMove={handleJoystickMove} onRelease={handleJoystickRelease} />
          <div style={{marginTop:12}}>
            <button onClick={stop} style={{background:'#f66',color:'#fff',width:'100%'}}>EMERGENCY STOP</button>
          </div>
        </div>

        <div style={{padding:12,border:'1px solid #eee',borderRadius:8}}>
          <h3>Status</h3>
          <div>Connected: <strong>{connected ? 'yes' : 'no'}</strong></div>
          <div style={{marginTop:8}}>Last message:</div>
          <pre style={{whiteSpace:'pre-wrap',background:'#fafafa',padding:8,borderRadius:6}}>{lastMsg}</pre>
        </div>
      </div>

      <div style={{padding:12,border:'1px solid #eee',borderRadius:8}}>
        <h3>Keyboard shortcuts</h3>
        <p style={{marginTop:0}}>Use arrow keys for movement, space to stop.</p>
        <KeyHandler onMove={move} onStop={stop} />
      </div>

    </div>
  );
}

function KeyHandler({ onMove, onStop }){
  useEffect(()=>{
    function onKey(e){
      if (e.repeat) return;
      if (e.key === 'ArrowUp') onMove('FWD');
      else if (e.key === 'ArrowDown') onMove('REV');
      else if (e.key === 'ArrowLeft') onMove('LEFT');
      else if (e.key === 'ArrowRight') onMove('RIGHT');
      else if (e.key === ' ') onStop();
    }
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[onMove,onStop]);
  return null;
}

function Joystick({ onMove, onRelease }) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const joystickRef = useRef(null);
  const centerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !joystickRef.current) return;
      
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let x = e.clientX - centerX;
      let y = e.clientY - centerY;
      
      // Limit to circle boundary
      const distance = Math.sqrt(x * x + y * y);
      const maxDistance = rect.width / 2 - 20; // 20px padding
      
      if (distance > maxDistance) {
        x = (x / distance) * maxDistance;
        y = (y / distance) * maxDistance;
      }
      
      setPosition({ x, y });
      
      // Calculate direction and speed
      const angle = Math.atan2(y, x);
      const degrees = angle * (180 / Math.PI);
      
      let direction = '';
      if (degrees >= -22.5 && degrees < 22.5) direction = 'RIGHT';
      else if (degrees >= 22.5 && degrees < 67.5) direction = 'FWD RIGHT';
      else if (degrees >= 67.5 && degrees < 112.5) direction = 'FWD';
      else if (degrees >= 112.5 && degrees < 157.5) direction = 'FWD LEFT';
      else if (degrees >= -157.5 && degrees < -112.5) direction = 'REV LEFT';
      else if (degrees >= -112.5 && degrees < -67.5) direction = 'REV';
      else if (degrees >= -67.5 && degrees < -22.5) direction = 'REV RIGHT';
      else if (degrees >= 157.5 || degrees < -157.5) direction = 'LEFT';
      
      if (direction) {
        onMove(direction, distance);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setPosition({ x: 0, y: 0 });
        onRelease();
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, onMove, onRelease]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    
    const rect = joystickRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    setIsDragging(true);
    
    const rect = joystickRef.current.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  };

  const handleTouchMove = (e) => {
    if (!isDragging || !joystickRef.current) return;
    
    const touch = e.touches[0];
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let x = touch.clientX - centerX;
    let y = touch.clientY - centerY;
    
    // Limit to circle boundary
    const distance = Math.sqrt(x * x + y * y);
    const maxDistance = rect.width / 2 - 20;
    
    if (distance > maxDistance) {
      x = (x / distance) * maxDistance;
      y = (y / distance) * maxDistance;
    }
    
    setPosition({ x, y });
    
    // Calculate direction and speed
    const angle = Math.atan2(y, x);
    const degrees = angle * (180 / Math.PI);
    
    let direction = '';
    if (degrees >= -22.5 && degrees < 22.5) direction = 'RIGHT';
    else if (degrees >= 22.5 && degrees < 67.5) direction = 'FWD RIGHT';
    else if (degrees >= 67.5 && degrees < 112.5) direction = 'FWD';
    else if (degrees >= 112.5 && degrees < 157.5) direction = 'FWD LEFT';
    else if (degrees >= -157.5 && degrees < -112.5) direction = 'REV LEFT';
    else if (degrees >= -112.5 && degrees < -67.5) direction = 'REV';
    else if (degrees >= -67.5 && degrees < -22.5) direction = 'REV RIGHT';
    else if (degrees >= 157.5 || degrees < -157.5) direction = 'LEFT';
    
    if (direction) {
      onMove(direction, distance);
    }
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      setPosition({ x: 0, y: 0 });
      onRelease();
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
      <div
        ref={joystickRef}
        style={{
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          backgroundColor: '#f0f0f0',
          border: '2px solid #ccc',
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none'
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            backgroundColor: '#999',
            borderRadius: '50%',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        />
        
        {/* Joystick handle */}
        <div
          style={{
            position: 'absolute',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: isDragging ? '#007bff' : '#666',
            border: '2px solid #333',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        />
        
        {/* Direction indicators */}
        <div style={{ position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: '#666' }}>FWD</div>
        <div style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: '#666' }}>REV</div>
        <div style={{ position: 'absolute', left: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#666' }}>LEFT</div>
        <div style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#666' }}>RIGHT</div>
      </div>
    </div>
  );
}

