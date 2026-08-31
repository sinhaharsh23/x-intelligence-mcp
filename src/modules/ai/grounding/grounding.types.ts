export interface GroundingSource {
  sourceType: 'x_api' | 'deterministic_analysis' | 'user_input';
  label: string;
  data: unknown;
}

export interface GroundingPayload {
  prompt: string;
  sourceType: 'x_api' | 'deterministic_analysis' | 'user_input' | 'mixed';
  sourceCount: number;
  sourceChars: number;
}
