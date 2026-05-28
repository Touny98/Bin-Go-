export const metadata = { title: 'Política de Privacidad – BinGo!' };

export default function PrivacidadPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', lineHeight: 1.7, color: '#222' }}>
      <h1>Política de Privacidad</h1>
      <p><strong>Última actualización:</strong> mayo 2025</p>

      <h2>1. Quiénes somos</h2>
      <p>BinGo! es un servicio de entretenimiento de bingo online operado a través de WhatsApp. El servicio es prestado por sus operadores con domicilio en la República Argentina.</p>

      <h2>2. Datos que recopilamos</h2>
      <ul>
        <li>Número de teléfono de WhatsApp</li>
        <li>Nombre que el usuario proporciona voluntariamente al registrarse</li>
        <li>Historial de participación en partidas y transacciones</li>
        <li>Mensajes intercambiados con el bot para procesar las solicitudes del usuario</li>
      </ul>

      <h2>3. Para qué usamos tus datos</h2>
      <ul>
        <li>Gestionar tu cuenta y participación en partidas de bingo</li>
        <li>Procesar compras de cartones y pagos</li>
        <li>Enviarte notificaciones sobre sorteos, resultados y premios</li>
        <li>Prevenir fraudes y garantizar la integridad del juego</li>
      </ul>

      <h2>4. Compartición de datos</h2>
      <p>No vendemos ni cedemos tus datos personales a terceros. Únicamente los compartimos con procesadores de pago (MercadoPago) en la medida necesaria para completar transacciones.</p>

      <h2>5. Retención de datos</h2>
      <p>Conservamos tus datos mientras tu cuenta esté activa o según lo exija la legislación argentina aplicable. Podés solicitar la eliminación de tu cuenta enviando un mensaje al bot con la palabra <strong>BAJA</strong>.</p>

      <h2>6. Seguridad</h2>
      <p>Aplicamos medidas técnicas y organizativas razonables para proteger tu información contra acceso no autorizado, pérdida o alteración.</p>

      <h2>7. Tus derechos</h2>
      <p>Conforme a la Ley 25.326 de Protección de Datos Personales de Argentina, tenés derecho a acceder, rectificar y suprimir tus datos personales. Para ejercer estos derechos contactanos por WhatsApp.</p>

      <h2>8. Uso de la API de WhatsApp (Meta)</h2>
      <p>Este servicio utiliza la API de WhatsApp Business de Meta para enviar y recibir mensajes. El uso de WhatsApp está sujeto además a las <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noreferrer">Políticas de Privacidad de WhatsApp</a>.</p>

      <h2>9. Cambios a esta política</h2>
      <p>Podemos actualizar esta política periódicamente. Te notificaremos por WhatsApp ante cambios relevantes.</p>

      <h2>10. Contacto</h2>
      <p>Para consultas sobre privacidad escribinos a través del bot de BinGo! en WhatsApp.</p>
    </main>
  );
}
