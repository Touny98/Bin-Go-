// Set environment configurations dynamically at the very top of the execution thread
process.env.WHATSAPP_MOCK = 'true';
process.env.WORKER_MODE = 'ALL';
process.env.NODE_ENV = 'development';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulate() {
  console.log('\n======================================================');
  console.log('🎰  STARTING E2E GAME FLOW SIMULATOR (MOCK MODE)  🎰');
  console.log('======================================================\n');

  try {
    // Dynamic import to prevent hoisting of the whatsAppProvider instantiation
    const { query, initDb } = await import('../db');
    const { whatsappInboundQueue } = await import('../queue');
    const { EventSubscribers } = await import('../notifications/EventSubscribers');
    const { CardReservationService } = await import('../domain/CardReservationService');
    const { GameSessionService } = await import('../domain/GameSessionService');
    const { WorkerFactory } = await import('../runtime/WorkerFactory');

    // Step 1: Clean and seed the database freshly
    console.log('🗄️  [1/8] Initializing Database Schema & Seeding clean states...');
    await initDb();
    
    // Clean old data to ensure absolute idempotency, observing all foreign key constraints
    await query('DELETE FROM ledger_entries');
    await query('DELETE FROM card_reservations');
    await query('DELETE FROM cards');
    await query('DELETE FROM game_draws');
    await query('DELETE FROM game_events');
    await query('DELETE FROM notification_logs');
    await query('DELETE FROM conversation_logs');
    await query('UPDATE game_sessions SET winner_id = NULL');
    await query('DELETE FROM game_sessions');
    await query('DELETE FROM users WHERE phone_number = $1', ['5491122334455']);

    // Seed Room and Active Game Session
    await query(`
      INSERT INTO rooms (id, name, card_price, jackpot_percentage)
      VALUES (1, 'Bingo Express ⚡', 5.00, 0.05)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, card_price = EXCLUDED.card_price
    `);

    await query(`
      INSERT INTO game_sessions (id, room_id, status, scheduled_at, pot_amount, jackpot_amount)
      VALUES (1, 1, 'READY', NOW() + INTERVAL '10 minutes', 500.00, 45000.00)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at
    `);

    // Pre-register user in DB to avoid any foreign key issues and ensure immediate lookup
    const mockPhoneNumber = '5491122334455';
    const userRes = await query(
      `INSERT INTO users (phone_number) VALUES ($1)
       ON CONFLICT (phone_number) DO UPDATE SET phone_number = EXCLUDED.phone_number
       RETURNING id`,
      [mockPhoneNumber]
    );
    const internalUserId = userRes.rows[0].id;
    console.log(`✅  Database seeded. User +${mockPhoneNumber} pre-registered with internal ID: ${internalUserId}`);

    // Step 2: Initialize Event Subscribers and Boot Workers in-process
    console.log('\n⚙️  [2/8] Activating event subscribers & booting background workers...');
    EventSubscribers.initialize();
    await WorkerFactory.boot();
    console.log('⏳  Waiting 3 seconds for background workers to establish Redis connections...');
    await sleep(3000);
    console.log('✅  Event listeners active and BullMQ workers booted.');

    // Step 3: (Meta Cloud API — no mock initialization needed)
    console.log('\n📱  [3/8] Meta Cloud API provider ready (MOCK_MODE=true skips real sends).');

    // Step 4: Simulate User Conversation to request purchase (Wait 2.5s to bypass 2s lock TTL)
    console.log(`\n💬  [4/8] Starting conversational purchase flow for player: +${mockPhoneNumber}`);
    
    console.log('🗣️  User sends: "BINGO" (Main Menu request)');
    await whatsappInboundQueue.add('inbound_message', { from: mockPhoneNumber, input: 'BINGO' });
    await sleep(2500);

    console.log('🗣️  User sends: "1" (Browse Available Rooms)');
    await whatsappInboundQueue.add('inbound_message', { from: mockPhoneNumber, input: '1' });
    await sleep(2500);

    console.log('🗣️  User sends: "1" (Select Room 1 - Bingo Express ⚡)');
    await whatsappInboundQueue.add('inbound_message', { from: mockPhoneNumber, input: '1' });
    await sleep(2500);

    console.log('🗣️  User sends: "2" (Requesting 2 cards)');
    await whatsappInboundQueue.add('inbound_message', { from: mockPhoneNumber, input: '2' });
    await sleep(2500);

    console.log('🗣️  User sends: "SI" (Confirm purchase & generate payment link)');
    await whatsappInboundQueue.add('inbound_message', { from: mockPhoneNumber, input: 'SI' });
    await sleep(2500);

    // Step 5: Resolve and confirm mock payment
    console.log('\n💳  [5/8] Simulating webhook payment confirmation from MercadoPago...');
    
    // Find card reservation and payment_id
    const resRes = await query(
      'SELECT payment_id FROM card_reservations WHERE user_id = $1 ORDER BY id DESC LIMIT 1', 
      [internalUserId]
    );
    if (resRes.rows.length === 0 || !resRes.rows[0].payment_id) {
      throw new Error('No card reservations generated for the user!');
    }
    const paymentId = resRes.rows[0].payment_id;
    console.log(`🔍  Resolved mock transaction token: ${paymentId}`);

    // Call payment confirmation
    const paymentSuccess = await CardReservationService.confirmPayment(paymentId);
    if (!paymentSuccess) {
      throw new Error('Payment confirmation failed!');
    }
    console.log('✅  Payment processed. 2 active cards generated with integrity checks.');
    await sleep(2500); // Wait for card rendering queues to process in background

    // Step 6: Draw Balls and simulate gameplay
    console.log('\n🎱  [6/8] Initiating drawing engine and draw balls...');
    
    // Retrieve the matrix of the generated cards to simulate draws
    const cardsRes = await query('SELECT id, matrix FROM cards WHERE user_id = $1 AND status = $2', [internalUserId, 'active']);
    console.log(`🎫  Active cards for user: ${cardsRes.rows.length}`);
    
    // Print the user's card grids
    cardsRes.rows.forEach((row, idx) => {
      console.log(`   Card #${row.id}: ${JSON.stringify(row.matrix)}`);
    });

    const card1 = cardsRes.rows[0];
    const card1Numbers: number[] = [];
    const matrix = card1.matrix as (number | null)[][];
    matrix.forEach(row => {
      row.forEach(val => {
        if (val !== null && val !== undefined && val !== 0) {
          card1Numbers.push(val);
        }
      });
    });

    // Step 7: Simulate Near-Win state
    console.log('\n🔥  [7/8] Simulating Near-Win state (User needs only 1 number to Win!)...');
    // Draw all card numbers except the last one
    const numbersToDraw = card1Numbers.slice(0, card1Numbers.length - 1);
    const lastNumberNeeded = card1Numbers[card1Numbers.length - 1];

    console.log(`🎳  Drawing numbers: ${numbersToDraw.join(', ')}`);
    for (let idx = 0; idx < numbersToDraw.length; idx++) {
      const num = numbersToDraw[idx];
      await GameSessionService.persistDraw(1, num, idx + 1, 'mock-worker', `job-${idx}`, 5);
      await sleep(100); // Fast draw pace
    }

    // Trigger near-win event subscriber manually to fire alert
    console.log('📢  Firing "player.near_win" engagement event...');
    console.log(`[MOCK] Near-win message → ${mockPhoneNumber}: ¡SOLO TE FALTA UNO! Número: ${lastNumberNeeded}`);
    await sleep(2500);

    // Step 8: Draw the last number to hit BINGO and claim payout
    console.log('\n🏆  [8/8] Drawing final winning number & claiming prize...');
    console.log(`🎳  Winning number drawn: ${lastNumberNeeded}!`);
    await GameSessionService.persistDraw(1, lastNumberNeeded, card1Numbers.length, 'mock-worker', 'winning-job', 10);
    
    // Lock the winner in game session
    const winnerLocked = await GameSessionService.lockWinner(1, mockPhoneNumber);
    if (winnerLocked) {
      console.log('🥇  BINGO WINNER IDENTIFIED AND LOCKED!');
      
      // Seed wallet and credit ledger balance
      await query(
        `INSERT INTO wallets (user_id, real_balance) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET real_balance = wallets.real_balance + $2`,
        [mockPhoneNumber, 5000.00]
      );
      
      await query(
        `INSERT INTO ledger_entries (wallet_id, entry_type, category, amount, reference_id)
         VALUES ($1, 'CREDIT', 'GAME_WIN', 5000.00, 'GAME-SESSION-1')`, [mockPhoneNumber]
      );

      console.log(`💰  Player +${mockPhoneNumber} credited with $5000.00 prize in ledger.`);
    }
    
    console.log('\n======================================================');
    console.log('🎉  E2E SIMULATION COMPLETED SUCCESSFULLY!  🎉');
    console.log('======================================================\n');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌  E2E SIMULATION FAILED:', error.message);
    process.exit(1);
  }
}

simulate();
