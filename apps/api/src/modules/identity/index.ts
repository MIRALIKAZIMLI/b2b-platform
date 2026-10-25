export { IdentityModule } from './identity.module';
export { type IdentityConfig } from './identity.config';
export {
  OTP_PURPOSES,
  type OtpPurpose,
  USER_STATUSES,
  type UserStatus,
  devSmsOutbox,
  otpChallenges,
  users,
} from './identity.schema';
export {
  OtpService,
  type RequestOtpInput,
  type RequestOtpResult,
  type VerifiedChallenge,
  type VerifyChallengeInput,
} from './otp.service';
