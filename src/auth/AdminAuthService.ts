import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { AdminRole } from '../ops/RBACService';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'changeme-insecure-default';
const JWT_EXPIRES_IN = '8h';

export interface AdminTokenPayload {
  sub: number;
  username: string;
  role: AdminRole;
  operatorId: string;
  operatorName: string;
}

export class AdminAuthService {
  static async login(username: string, password: string): Promise<string | null> {
    const result = await query(
      "SELECT id, username, password_hash, role FROM admin_users WHERE username = $1 AND status = 'ACTIVE'",
      [username]
    );

    const admin = result.rows[0];
    if (!admin) return null;

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return null;

    const payload: AdminTokenPayload = {
      sub: admin.id,
      username: admin.username,
      role: admin.role,
      operatorId: `admin-${admin.id}`,
      operatorName: admin.username,
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  static verifyToken(token: string): AdminTokenPayload {
    return jwt.verify(token, JWT_SECRET) as unknown as AdminTokenPayload;
  }

  static async hashPassword(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, 12);
  }
}
