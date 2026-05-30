# Memo — Frente legal (jurisdicción: Salta, Argentina)

> ⚠️ **Esto NO es asesoramiento legal.** Es un mapa para ir a un abogado de gaming
> con las preguntas correctas y no pagar horas en lo que ya sabés. Antes de operar
> con dinero real, dictamen profesional obligatorio.
>
> Fecha: 2026-05-29. Operador: persona física, San Ramón de la Nueva Orán, Salta.

## 1. Marco: el juego es competencia PROVINCIAL, no nacional
En Argentina **no existe una ley nacional única** de juego online. La Corte Suprema sostuvo que la regulación del juego es una facultad que las provincias **nunca delegaron a la Nación**. Resultado: **24 jurisdicciones**, cada una con su regulador, sus normas y sus licencias. Operar en varias provincias = una licencia **por provincia**.

A mayo 2025, **20 de 24** jurisdicciones ya tenían juego online regulado y operativo. Las que faltaban: **Salta, Santiago del Estero y Tierra del Fuego**.

## 2. Salta en concreto
- **Regulador: EnReJA** — Ente Regulador del Juego de Azar de Salta. Sede: Av. 25 de Mayo 550, Salta Capital.
- **Marco: Ley provincial 7020** (Marco Regulatorio de Juegos de Azar).
- **Estado del juego online (a feb 2026):** habilitado, pero **EnReJA confirmó que los ÚNICOS dos operadores autorizados son BetWarrior y BetPoncho**, y que **no se otorgaron nuevos permisos** de iGaming. El juego online en la provincia sólo lo explotan esos licenciatarios.

### Qué significa para vos
- **Bingo por dinero real y Truco por apuestas = juego de azar / apuestas** → caen bajo EnReJA. (Que el truco tenga componente de destreza no lo saca automáticamente de la órbita regulatoria; además mover dinero de apostadores activa obligaciones de prevención de lavado / UIF.)
- **Licencia propia en Salta hoy: prácticamente cerrada.** No hay cupo / no se dan permisos nuevos.
- **Operar sin autorización es delito penal.** Los operadores de apuestas online sin autorización en provincias donde el juego está regulado están sujetos a **3 a 6 años de prisión** (Código Penal — juego ilegal). Esto NO es una multa administrativa: es prisión. **No operes con dinero real sin resolver esto.**

## 3. Caminos posibles (de menor a mayor riesgo)

### A) ✅ RECOMENDADO — Proveedor de tecnología (B2B / white-label)
Vos NO operás ni tomás apuestas. Le **licenciás la plataforma** (Bingo + Truco vía WhatsApp) a un **operador ya licenciado** — en Salta serían BetWarrior/BetPoncho, o un licenciatario de otra provincia. Ellos ponen la licencia, el KYC, el canon y la cara regulatoria; vos cobrás fee de software / revenue-share.
- **Pros:** sin exposición penal, sin capital de licencia, ingresos recurrentes (múltiplos SaaS), es el modelo estándar de la industria iGaming.
- **Contras:** dependés de cerrar un acuerdo comercial; menor captura de margen que operar.
- **Acción:** preparar un *one-pager* técnico/comercial + demo y contactar operadores licenciados.

### B) Licencia propia en una provincia ABIERTA (no Salta)
Salta no da permisos nuevos, pero hay 20 jurisdicciones reguladas. Algunas abren procesos de licencia.
- **Pros:** capturás todo el rake.
- **Contras:** capital fuerte, canon, garantías financieras, certificaciones, estructura societaria (difícil como persona física). Una licencia por provincia.
- **Acción:** evaluar con el abogado qué provincia tiene proceso abierto y costos realistas.

### C) Pivot a NO-dinero-real (de-risking inmediato para validar producto)
Operar como **free-to-play / social** (fichas sin valor de rescate, o premios por mecánica promocional/sorteo debidamente autorizado, o modalidad de destreza sin apuesta). Saca el producto de la órbita de "juego de azar por dinero".
- **Pros:** **podés lanzar YA, legalmente**, validar funnel, retención y producto sin riesgo penal — y eso es exactamente la métrica que sube la valuación.
- **Contras:** monetización indirecta (publicidad, cosméticos, suscripción), no el rake directo.
- **Acción:** definir con el abogado el límite exacto entre "social/promocional" y "apuesta".

### D) ❌ NO recomendado — Offshore (Curaçao, etc.)
Una licencia offshore **no legaliza targetear jugadores argentinos**: las provincias bloquean y penalizan a operadores sin autorización local. Sigue activo el riesgo penal del punto 2. No es solución para el mercado AR.

## 4. Requisitos técnicos que esto gatilla (→ backlog)
Surjan por la vía A, B o C (versión light), estos son requisitos típicos de cumplimiento:
- **KYC + verificación de edad (+18):** campos de identidad en `users` (hoy no existen).
- **Juego responsable:** límites de depósito configurables, **autoexclusión**, alertas de tiempo de juego.
- **AML / UIF:** umbrales de reporte, trazabilidad de fondos (el ledger ayuda).
- **RNG certificado:** ← conecta con WS2 (commit-reveal provably-fair es prerequisito).
- **Retención de datos y auditoría.**
- **Canon / tributación** provincial (lo asume el licenciatario en la vía A).

## 5. Preguntas para el abogado de gaming
1. ¿Confirma que Bingo-por-dinero y Truco-por-apuestas caen bajo Ley 7020 / EnReJA?
2. ¿Hay alguna ventana para nuevas licencias en Salta o está cerrado de hecho?
3. Vía B2B: ¿qué figura contractual y societaria conviene como proveedor de tecnología a un licenciatario? ¿Qué responsabilidad me queda?
4. ¿Dónde está exactamente la línea entre modelo "social/promocional" (sin licencia) y "apuesta" (con licencia)? ¿Un modelo de sorteo/promoción es viable en Salta?
5. ¿Qué provincias tienen proceso de licencia abierto y cuál es el costo/canon/garantía realista?
6. Exposición penal personal (art. juego ilegal) en cada escenario.

## 6. Próximos pasos
1. **Contratar abogado de gaming** con las 6 preguntas de arriba.
2. En paralelo, **decidir entre vía A (B2B) y vía C (social)** para no frenar el producto. Sugerencia: lanzar **C (social)** para validar funnel mientras se negocia **A (B2B)**.
3. Crear backlog técnico de KYC + juego responsable (no bloquea si se arranca social).

---
### Fuentes
- [EnReJA — sitio oficial](https://www.enrejasalta.com.ar/)
- [Yogonet — EnReJA: BetWarrior y BetPoncho, únicos operadores con licencia en Salta (feb 2026)](https://www.yogonet.com/latinoamerica/noticias/2026/02/27/107827-enreja-informa-que-betwarrior-y-betponcho-son-los-dos-unicos-operadores-con-licencia-en-salta)
- [SoloAzar — ENREJA refuerza el control del juego online en Salta](https://www.soloazar.com/es/categoria/legislacion/salta-enreja-refuerza-el-control-del-juego-online-y-confirma-que-solo-hay-dos-plataformas-legales-en-la-provincia)
- [Yogonet — ¿En qué provincias está regulado el juego online? (jul 2025)](https://www.yogonet.com/latinoamerica/noticias/2025/07/23/105076-argentina-en-que-provincias-esta-regulado-el-juego-online)
- [Gobierno de Salta — plataformas de juego online autorizadas](https://www.salta.gob.ar/prensa/noticias/enreja-informa-a-la-poblacion-sobre-las-plataformas-de-juego-online-autorizadas-en-la-provincia-106462)
