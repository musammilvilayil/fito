import { z } from "zod";
import { optionalEmailField, optionalPhoneField, passwordField, requiredText } from "./common";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.input<typeof loginSchema>;

const contact = {
  email: optionalEmailField,
  phone: optionalPhoneField,
};

export const registerSchema = z
  .object({
    fullName: requiredText("Your name", 120),
    ...contact,
    password: passwordField,
    gymName: requiredText("Gym name", 120),
    city: requiredText("City", 80),
    accessCode: z.string().trim().optional().nullable(),
  })
  .refine((v) => v.email || v.phone, { message: "Enter an email or phone number", path: ["email"] });
export type RegisterInput = z.input<typeof registerSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  fullName: z.string().trim().max(120).optional(),
  password: passwordField.optional(),
});
export type AcceptInviteInput = z.input<typeof acceptInviteSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordField,
});

export const switchGymSchema = z.object({ gymId: z.uuid() });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordField,
});
