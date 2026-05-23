import { Router } from 'express';
import { whatsAppProvider } from '../notifications/providers/WhatsAppWebProvider';

const router = Router();

router.get('/qr', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp QR - BinGo!</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          text-align: center;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 28px;
        }
        .subtitle {
          color: #666;
          margin-bottom: 30px;
          font-size: 14px;
        }
        .qr-box {
          background: #f5f5f5;
          border: 3px dashed #667eea;
          border-radius: 15px;
          padding: 30px;
          margin-bottom: 30px;
        }
        .qr-placeholder {
          background: white;
          border: 2px solid #ddd;
          border-radius: 10px;
          padding: 20px;
          font-family: monospace;
          font-size: 12px;
          color: #666;
          word-break: break-all;
          min-height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .instructions {
          background: #f0f4ff;
          border-left: 4px solid #667eea;
          padding: 15px;
          border-radius: 5px;
          text-align: left;
          margin-bottom: 20px;
        }
        .instructions h3 {
          color: #667eea;
          font-size: 14px;
          margin-bottom: 10px;
        }
        .instructions ol {
          margin-left: 20px;
          font-size: 13px;
          color: #555;
        }
        .instructions li {
          margin-bottom: 8px;
        }
        .status {
          display: inline-block;
          background: #4caf50;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          margin-top: 15px;
        }
        .status.mock {
          background: #ff9800;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 WhatsApp BinGo!</h1>
        <p class="subtitle">Escanea el código QR para conectar</p>

        <div class="qr-box">
          <div class="qr-placeholder">
            MOCK_BINGO_QR_CODE<br>
            <small style="margin-top: 10px; display: block; color: #999;">
              (Modo simulado para pruebas)
            </small>
          </div>
        </div>

        <div class="instructions">
          <h3>📖 Cómo conectar:</h3>
          <ol>
            <li>Abre WhatsApp en tu teléfono</li>
            <li>Ve a Configuración → Dispositivos conectados</li>
            <li>Selecciona "Conectar dispositivo"</li>
            <li>Escanea el código QR</li>
            <li>¡Listo! Tu teléfono está conectado</li>
          </ol>
        </div>

        <div class="status mock">⚠️ MODO SIMULADO (MOCK)</div>
        <p style="font-size: 12px; color: #999; margin-top: 15px;">
          En modo simulado, los mensajes son respondidos automáticamente para pruebas.<br>
          Para usar WhatsApp real, contacta al administrador.
        </p>
      </div>
    </body>
    </html>
  `);
});

export default router;
