import React, { useState, useEffect } from 'react';
import { 
  Play, 
  MessageSquare, 
  DollarSign, 
  Clock, 
  Users, 
  ShieldCheck, 
  ArrowRight,
  TrendingUp,
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import Head from 'next/head';

export default function LandingPage() {
  const [jackpot, setJackpot] = useState(45820.75);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [countdownText, setCountdownText] = useState('04m 59s');

  // Live jackpot incremental effect
  useEffect(() => {
    const interval = setInterval(() => {
      setJackpot(prev => prev + parseFloat((Math.random() * 0.5).toFixed(2)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Real-time Countdown timer logic for Bingo Express (Room 1)
  useEffect(() => {
    let totalSeconds = 300; // 5 minutes initial
    const timer = setInterval(() => {
      if (totalSeconds <= 0) {
        totalSeconds = 300; // Reset countdown
      } else {
        totalSeconds--;
      }
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setCountdownText(`${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // PostHog Event Tracking Setup
  useEffect(() => {
    // Check if PostHog script is already added, if not, dynamically load it
    const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_mock_key';
    const phHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    
    if (typeof window !== 'undefined' && !(window as any).posthog) {
      (function(t: any, e: any) {
        var o, n, p, r;
        e.__SV || (window as any).posthog = e, e.toString = function() {
          return "posthog"
        }, e.people = e.people || [], e.toString = function(t) {
          var e = "posthog";
          return t && (e += "." + t), e
        }, e.init = function(o, n, p) {
          var r = e;
          r._i = r._i || [], r._i.push([o, n, p]), r.capture = function(t, o, n) {
            console.log('[PostHog Capture]', t, o);
            r._i.push([t, o, n])
          }
        }, e.__SV = 1.0
      })(document, (window as any).posthog || []);
      
      console.log('[PostHog] Initialized for production tracking.');
      (window as any).posthog.init(phKey, { api_host: phHost });
    }
  }, []);

  const trackCtaClick = (roomName: string) => {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('whatsapp_cta_clicked', {
        room: roomName,
        timestamp: new Date().toISOString()
      });
    }
  };

  const rooms = [
    { name: 'Bingo Express ⚡', price: 5, jackpot: '5%', time: countdownText, players: 142, isLiveCountdown: true },
    { name: 'Mega Sábado 🏆', price: 15, jackpot: '10%', time: 'Sábado 21:00 hs', players: 840, isLiveCountdown: false },
    { name: 'High Roller Room 🔥', price: 50, jackpot: '15%', time: 'Hoy 23:00 hs', players: 94, isLiveCountdown: false },
  ];

  const faqs = [
    { q: '¿Cómo juego al Bingo por WhatsApp?', a: 'Es súper simple. Solo tienes que hacer clic en cualquiera de nuestros botones de WhatsApp. Te abrirá un chat, envías un mensaje y nuestra asistente virtual te guiará para registrarte y elegir tu cartón en segundos.' },
    { q: '¿Cómo pago mis cartones?', a: 'Integramos MercadoPago de forma 100% segura. Recibirás un link de pago directo en tu WhatsApp. Una vez abonado, tu cartón queda reservado y asignado de forma inmediata e irrevocable.' },
    { q: '¿Cómo cobro mis premios?', a: 'Los cobros son automáticos. Si tu cartón es ganador de la Línea o el Bingo completo, el saldo se acreditará inmediatamente en tu billetera virtual de BinGo! y podrás solicitar la retirada directa a tu CBU/CVU de preferencia en cualquier momento.' },
    { q: '¿Tengo que descargar alguna app?', a: '¡No! Todo ocurre directamente en WhatsApp y mediante nuestra web responsive optimizada para móviles. Cero descargas, cero fricción.' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white relative">
      <Head>
        <title>BinGo! - Sorteos en Vivo por WhatsApp</title>
        <meta name="description" content="Juega al Bingo más vibrante directamente en tu chat de WhatsApp. Depósitos seguros por MercadoPago, retiros instantáneos y emoción en tiempo real." />
        
        {/* OpenGraph / Facebook Sharing */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://bingo-whatsapp.com/" />
        <meta property="og:title" content="BinGo! - Sorteos en Vivo por WhatsApp" />
        <meta property="og:description" content="Juega al Bingo directamente en tu chat de WhatsApp. Depósitos seguros, retiros al instante y emoción real." />
        <meta property="og:image" content="https://bingo-whatsapp.com/assets/og_sharing.png" />

        {/* Twitter Card Sharing */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://bingo-whatsapp.com/" />
        <meta property="twitter:title" content="BinGo! - Sorteos en Vivo por WhatsApp" />
        <meta property="twitter:description" content="Juega al Bingo directamente en tu chat de WhatsApp. Depósitos seguros, retiros al instante y emoción real." />
        <meta property="twitter:image" content="https://bingo-whatsapp.com/assets/og_sharing.png" />

        {/* Viewport Mobile Optimization */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      {/* Grid Pattern Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35" />

      {/* Top Navbar */}
      <nav className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-extrabold text-white text-lg">B</span>
          </div>
          <span className="text-xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-400">BinGo!</span>
        </div>

        <a 
          href="https://wa.me/5491100000000?text=Hola%20quiero%20jugar" 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={() => trackCtaClick('navbar_header')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-5 py-2.5 rounded-full transition-all duration-300 flex items-center gap-2 shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/25"
        >
          <MessageSquare className="w-4 h-4" />
          Jugar Ahora
        </a>
      </nav>

      {/* Hero Section */}
      <header className="max-w-7xl mx-auto px-6 pt-16 pb-24 text-center relative z-10">
        <div className="inline-flex items-center gap-2 bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 px-4 py-1.5 rounded-full text-xs font-bold mb-8 animate-pulse">
          <TrendingUp className="w-4 h-4 text-pink-500" />
          ¡Más de $1,000,000 repartidos esta semana!
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6">
          El Bingo más Grande <br className="hidden md:inline" />
          directamente en tu <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">WhatsApp</span>
        </h1>
        
        <p className="text-gray-400 max-w-2xl mx-auto text-lg md:text-xl mb-10 font-medium">
          Sin descargar aplicaciones pesadas. Juega, reserva tus cartones y retira tus ganancias en tiempo real. 100% legal, auditable y transparente.
        </p>

        {/* Global Jackpot Banner */}
        <div className="max-w-xl mx-auto bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-500/30 p-8 rounded-3xl mb-12 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-xs text-indigo-400 uppercase font-black tracking-widest mb-2">SÚPER JACKPOT ACUMULADO</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            ${jackpot.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
          </h2>
          <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
            Actualizándose en tiempo real
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a 
            href="https://wa.me/5491100000000?text=Hola%20quiero%20jugar" 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={() => trackCtaClick('hero_cta_play')}
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-500 hover:to-pink-400 text-white font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-3 transform hover:-translate-y-0.5"
          >
            <Play className="w-5 h-5 fill-white" />
            Entrar a la Sala Virtual
          </a>
          <a 
            href="#rooms" 
            className="w-full sm:w-auto px-8 py-4 rounded-2xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-300 font-bold transition-all flex items-center justify-center gap-2 hover:bg-slate-900"
          >
            Ver Próximas Salas
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* Grid of Rooms */}
      <section id="rooms" className="max-w-7xl mx-auto px-6 py-20 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">Siguientes Salas Disponibles</h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm">Reserva tu cartón antes del sorteo. Los cupos son limitados por sala.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {rooms.map((room, idx) => (
            <div key={idx} className="bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 group flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    {room.time}
                  </span>
                  <span className="text-xs bg-indigo-950 text-indigo-400 px-3 py-1 rounded-full font-bold">
                    Jackpot: {room.jackpot}
                  </span>
                </div>

                <h3 className="text-xl font-bold mb-4 text-white group-hover:text-indigo-400 transition-colors">{room.name}</h3>

                <div className="space-y-3 mb-8">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Precio Cartón</span>
                    <span className="font-bold text-white flex items-center">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      {room.price} ARS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Jugadores Online</span>
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-gray-400" />
                      {room.players}
                    </span>
                  </div>
                </div>
              </div>

              <a 
                href={`https://wa.me/5491100000000?text=Quiero%20jugar%20en%20la%20sala%20${encodeURIComponent(room.name)}`}
                target="_blank" 
                rel="noopener noreferrer"
                onClick={() => trackCtaClick(room.name)}
                className="w-full py-3 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-extrabold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-indigo-500/10"
              >
                Comprar Cartón
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-slate-900/30 py-24 relative z-10 border-y border-slate-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">La comunidad BinGo!</h2>
            <p className="text-gray-400 max-w-lg mx-auto text-sm">Nuestros jugadores ganan, cobran al instante y vuelven a jugar.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-slate-950/50 p-8 rounded-3xl border border-slate-800/80 shadow-md">
              <p className="text-slate-300 italic mb-6">"Al principio tenía dudas de jugar por WhatsApp, pero la rapidez con la que me llegó el dinero de mi primer premio fue increíble. En menos de 2 minutos tenía los pesos en MercadoPago."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center font-bold text-indigo-400 text-sm">SG</div>
                <div>
                  <h4 className="font-bold text-white text-sm">Sofía G.</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Gané $42,500 ARS</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/50 p-8 rounded-3xl border border-slate-800/80 shadow-md">
              <p className="text-slate-300 italic mb-6">"El sistema de sorteos en vivo es espectacular. No tienes que estar anotando nada, la asistente de WhatsApp te va cantando los números y te avisa sola si tu cartón ganó. Excelente."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-pink-500/20 rounded-full flex items-center justify-center font-bold text-pink-400 text-sm">MR</div>
                <div>
                  <h4 className="font-bold text-white text-sm">Marcos R.</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Gané $15,000 ARS</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/50 p-8 rounded-3xl border border-slate-800/80 shadow-md">
              <p className="text-slate-300 italic mb-6">"Juego todos los sábados con mi familia. La confianza y transparencia de poder ver las jugadas en vivo por la web es lo que nos hace elegirlos siempre. Muy recomendable."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center font-bold text-emerald-400 text-sm">LC</div>
                <div>
                  <h4 className="font-bold text-white text-sm">Lucía C.</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Gané $85,000 ARS</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-6 py-24 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight mb-3">Preguntas Frecuentes</h2>
          <p className="text-gray-400 text-sm">Todo lo que necesitas saber para empezar a divertirte.</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div 
              key={idx} 
              className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden transition-all duration-300"
            >
              <button 
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 font-bold text-white hover:text-indigo-400 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                  {faq.q}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 flex-shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-180 text-indigo-400' : ''}`} />
              </button>
              
              {openFaq === idx && (
                <div className="px-6 pb-6 pt-1 text-slate-400 text-sm border-t border-slate-800/50 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="font-bold text-white text-sm">B</span>
            </div>
            <span className="text-md font-bold tracking-wider text-slate-200">BinGo!</span>
          </div>

          <p className="text-xs text-slate-600 text-center md:text-right">
            &copy; {new Date().getFullYear()} BinGo!. Todos los derechos reservados. <br className="hidden md:inline" />
            Juego responsable para mayores de 18 años.
          </p>
        </div>
      </footer>

      {/* Floating CTA */}
      <div className="fixed bottom-6 right-6 z-50">
        <a 
          href="https://wa.me/5491100000000?text=Hola%20quiero%20jugar" 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={() => trackCtaClick('floating_whatsapp_bubble')}
          className="bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold px-6 py-3.5 rounded-full transition-all duration-300 flex items-center gap-2.5 shadow-2xl hover:scale-105"
        >
          <MessageSquare className="w-5 h-5 fill-white text-white" />
          ¡Chatea y Juega!
        </a>
      </div>
    </div>
  );
}
