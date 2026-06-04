import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects a route with the JWT access token. On success, req.user is populated
 * with the AuthUser returned by JwtStrategy.validate.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
