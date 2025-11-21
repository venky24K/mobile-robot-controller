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
  const move = (dir) => sendCmd(`MOVE ${dir} 100`);
  const stop = () => sendCmd('STOP');

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
          <h3>Controls</h3>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>move('FWD')}>Forward</button>
            <button onClick={()=>move('REV')}>Back</button>
            <button onClick={()=>move('LEFT')}>Left</button>
            <button onClick={()=>move('RIGHT')}>Right</button>
            <button onClick={stop} style={{background:'#f66',color:'#fff'}}>EMER STOP</button>
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

