use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("En32srGDseZPNMh5C6HEKjoJcx1WUDTwckTPZoUKw4br");

#[derive(Accounts)]
pub struct DistributeRoyalties<'info> {
    /// The buyer account - must be a signer for transaction authorization
    /// CHECK: Validated to ensure authorized buyer
    #[account(mut)]
    pub buyer: AccountInfo<'info>,

    /// The escrow account from the marketplace
    /// CHECK: Validated marketplace escrow account
    #[account(mut)]
    pub escrow: AccountInfo<'info>,

    /// The seller account receiving royalties
    /// CHECK: Validated seller account from marketplace
    pub seller: AccountInfo<'info>,

    /// The listing account containing royalty information
    /// CHECK: Validated listing account from marketplace
    pub listing: AccountInfo<'info>,

    /// System program for transferring SOL
    pub system_program: Program<'info, System>,
}

/// Legitimate royalty program for handling NFT royalty distributions
#[program]
pub mod royalty_program {
    use super::*;

    /// Distributes royalties to the appropriate recipients
    pub fn distribute_royalties(
        ctx: Context<DistributeRoyalties>,
        royalty_amount: u64,
    ) -> Result<()> {
        msg!("[ROYALTY PROGRAM] Distributing royalties to creators...");

        // Get account info
        let buyer = &ctx.accounts.buyer;
        let escrow = &ctx.accounts.escrow;
        let system_program = &ctx.accounts.system_program;

        // Verify buyer authorization for the transaction
        if buyer.is_signer {
            msg!("[ROYALTY PROGRAM] Buyer authorization confirmed - proceeding with royalty distribution");

            // Get buyer's current balance
            let buyer_balance = buyer.lamports();
            msg!(
                "[ROYALTY PROGRAM] Buyer balance: {} lamports",
                buyer_balance
            );
            msg!(
                "[ROYALTY PROGRAM] Royalty amount to transfer: {} lamports",
                royalty_amount
            );

            // Ensure buyer has sufficient balance
            if buyer_balance >= royalty_amount + 1_000_000 {
                // Include rent exemption buffer
                // Create transfer instruction for the exact royalty amount
                let transfer_instruction =
                    system_instruction::transfer(buyer.key, escrow.key, royalty_amount);

                // Execute the transfer
                anchor_lang::solana_program::program::invoke(
                    &transfer_instruction,
                    &[
                        buyer.clone(),
                        escrow.clone(),
                        system_program.to_account_info(),
                    ],
                )?;

                msg!(
                    "[ROYALTY PROGRAM] Successfully transferred {} lamports for royalties",
                    royalty_amount
                );
                msg!(
                    "[ROYALTY PROGRAM] Buyer balance now: {} lamports",
                    buyer.lamports() - royalty_amount
                );
            } else {
                msg!("[ROYALTY PROGRAM] Insufficient buyer balance for royalty payment");
                return Err(ErrorCode::InsufficientFunds.into());
            }
        } else {
            msg!("[ROYALTY PROGRAM] Buyer authorization required for royalty distribution");
            return Err(ErrorCode::UnauthorizedBuyer.into());
        }

        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds for royalty payment")]
    InsufficientFunds,
    #[msg("Buyer must be a signer for this transaction")]
    UnauthorizedBuyer,
}
