export const metadata = { title: 'Términos y Condiciones – BinGo!' };

export default function TerminosPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', lineHeight: 1.7, color: '#222' }}>
      <h1>Términos y Condiciones del Servicio</h1>
      <p><strong>Última actualización:</strong> mayo 2025</p>

      <h2>1. Aceptación de los términos</h2>
      <p>Al interactuar con el bot de BinGo! en WhatsApp, aceptás estos Términos y Condiciones en su totalidad. Si no estás de acuerdo, no utilices el servicio.</p>

      <h2>2. Descripción del servicio</h2>
      <p>BinGo! es un juego de bingo online operado a través de WhatsApp. Los usuarios pueden comprar cartones virtuales, participar en sorteos programados y recibir premios en caso de ganar.</p>

      <h2>3. Elegibilidad</h2>
      <ul>
        <li>Debés tener 18 años o más para participar.</li>
        <li>El servicio está disponible para residentes de la República Argentina.</li>
        <li>Cada usuario puede tener una sola cuenta asociada a su número de WhatsApp.</li>
      </ul>

      <h2>4. Compra de cartones</h2>
      <ul>
        <li>Los cartones se adquieren mediante pago previo a través de MercadoPago.</li>
        <li>Una vez confirmado el pago, el cartón queda reservado para el sorteo correspondiente.</li>
        <li>No se realizan devoluciones una vez iniciado el sorteo.</li>
      </ul>

      <h2>5. Sorteos y premios</h2>
      <ul>
        <li>Los sorteos se realizan en los horarios publicados dentro del bot.</li>
        <li>El resultado es determinado por un generador de números aleatorios auditado.</li>
        <li>Los premios se acreditan en la billetera virtual del usuario dentro de las 24 hs de finalizado el sorteo.</li>
        <li>Los premios pueden retirarse mediante transferencia bancaria o Mercado Pago, previa verificación de identidad.</li>
      </ul>

      <h2>6. Retiros</h2>
      <p>Los retiros están sujetos a verificación antifraude. BinGo! se reserva el derecho de suspender retiros ante indicios de uso indebido del servicio.</p>

      <h2>7. Conducta del usuario</h2>
      <p>Queda prohibido el uso de bots, scripts automatizados o cualquier mecanismo que altere el funcionamiento normal del juego. La violación de esta norma resultará en la suspensión permanente de la cuenta.</p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>BinGo! no se responsabiliza por interrupciones del servicio debidas a fallas de WhatsApp, cortes de conectividad u otros factores fuera de su control.</p>

      <h2>9. Modificaciones</h2>
      <p>Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios se comunicarán a través del bot con al menos 7 días de anticipación.</p>

      <h2>10. Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República Argentina. Cualquier disputa será sometida a los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.</p>

      <h2>11. Contacto</h2>
      <p>Para consultas sobre estos términos, escribinos a través del bot de BinGo! en WhatsApp.</p>
    </main>
  );
}
