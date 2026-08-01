/** LP shares are minted as `sqrt(amountA * amountB)`, so they inherit 18 decimals. */
export const LP_DECIMALS = 18;

/** Slippage choices offered in the swap form, in basis points. */
export const SLIPPAGE_OPTIONS = [50, 100, 500] as const;

/** Amount minted per token by the faucet button, in whole tokens. */
export const FAUCET_AMOUNT = 1000;
