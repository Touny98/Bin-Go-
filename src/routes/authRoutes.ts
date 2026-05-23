import { Router } from 'express';
import { AdminAuthService } from '../auth/AdminAuthService';
import { logger } from '../utils/logger';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const token = await AdminAuthService.login(username, password);

    if (!token) {
      logger.warn({ username }, '[Auth] Failed login attempt');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    logger.info({ username }, '[Auth] Successful login');
    return res.json({ token, expiresIn: '8h' });
  } catch (err: any) {
    logger.error({ error: err.message }, '[Auth] Login error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
