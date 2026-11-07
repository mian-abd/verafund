import type { CardStatus, ProviderResult } from "../engine";

export type PaymentsMode = "stripe" | "simulated";

export interface CreateCardInput {
  merchant: string;
  limitCents: number;
  workspaceId: string;
  subscriptionId: string;
}

export interface AuthorizeInput {
  cardId: string;
  amountCents: number;
  merchant: string;
}

export interface AuthorizeResult extends ProviderResult {
  authorizationId: string | null;
}

export interface PaymentsAdapter {
  mode: PaymentsMode;
  createCard(input: CreateCardInput): Promise<{ cardId: string; last4: string }>;
  setLimit(cardId: string, limitCents: number): Promise<void>;
  setStatus(cardId: string, status: CardStatus): Promise<void>;
  authorize(input: AuthorizeInput): Promise<AuthorizeResult>;
}
