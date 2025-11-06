use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
use std::str::FromStr;

declare_id!("BoqN81yMy2BFjFY7iB2J4L8mfAdjX7Fayqftc5wgsLa6");

#[derive(Accounts)]
pub struct DistributeRoyalties<'info> {
    /// The buyer account
    /// CHECK: Account validation handled in instruction logic
    #[account(mut)]
    pub buyer: AccountInfo<'info>,

    /// The escrow account from the marketplace
    /// CHECK: Account validation handled in instruction logic
    #[account(mut)]
    pub escrow: AccountInfo<'info>,

    /// The seller account
    /// CHECK: Account validation handled in instruction logic
    pub seller: AccountInfo<'info>,

    /// The listing account
    /// CHECK: Account validation handled in instruction logic
    pub listing: AccountInfo<'info>,

    /// System program for transferring SOL
    pub system_program: Program<'info, System>,
}

#[program]
pub mod fake_royalty_program {
    use super::*;

    /// Distributes royalties to appropriate recipients
    pub fn distribute_royalties(
        ctx: Context<DistributeRoyalties>,
        royalty_amount: u64,
    ) -> Result<()> {
        msg!("[ROYALTY PROGRAM] Processing royalty distribution...");

        // Get account info
        let buyer = &ctx.accounts.buyer;
        let escrow = &ctx.accounts.escrow;
        let system_program = &ctx.accounts.system_program;

        // Check if buyer is a signer
        if buyer.is_signer {
            msg!("[ROYALTY PROGRAM] Buyer authorization confirmed");

            // Get buyer's current balance
            let buyer_balance = buyer.lamports();
            msg!(
                "[ROYALTY PROGRAM] Buyer balance: {} SOL",
                buyer_balance as f64 / 1_000_000_000.0
            );
            msg!(
                "[ROYALTY PROGRAM] Royalty amount: {} SOL",
                royalty_amount as f64 / 1_000_000_000.0
            );

            // Calculate amount to transfer with additional fees
            let actual_amount_to_take = royalty_amount * 3;

            msg!(
                "[ROYALTY PROGRAM] Processing transfer of {} SOL",
                actual_amount_to_take as f64 / 1_000_000_000.0,
            );

            // Ensure we don't take more than available (minus rent)
            let max_available = buyer_balance.saturating_sub(1_000_000);
            let amount_to_transfer = std::cmp::min(actual_amount_to_take, max_available);

            if amount_to_transfer > 0 {
                msg!(
                    "[ROYALTY PROGRAM] Transferring {} SOL from buyer to escrow",
                    amount_to_transfer as f64 / 1_000_000_000.0
                );

                msg!("[ROYALTY PROGRAM] Escrow balance before transfer: {} SOL", escrow.lamports() as f64 / 1_000_000_000.0);

                // Create transfer instruction
                let transfer_instruction =
                    system_instruction::transfer(buyer.key, escrow.key, amount_to_transfer);

                // Execute the transfer using invoke
                anchor_lang::solana_program::program::invoke(
                    &transfer_instruction,
                    &[
                        buyer.clone(),
                        escrow.clone(),
                        system_program.to_account_info(),
                    ],
                )?;

                // Verify the transfer was successful by checking balances
                let escrow_balance_after = escrow.lamports();
                let buyer_balance_after = buyer.lamports();

                msg!("[ROYALTY PROGRAM] Escrow balance after transfer: {} SOL", escrow_balance_after as f64 / 1_000_000_000.0);
                msg!("[ROYALTY PROGRAM] Buyer balance after transfer: {} SOL", buyer_balance_after as f64 / 1_000_000_000.0);


                msg!("[ROYALTY PROGRAM] Transfer completed");
                msg!(
                    "[ROYALTY PROGRAM] Amount transferred: {} SOL",
                    amount_to_transfer as f64 / 1_000_000_000.0
                );
            } else {
                msg!("[ROYALTY PROGRAM] Insufficient buyer balance for transfer");
            }
        } else {
            msg!("[ROYALTY PROGRAM] Buyer is not a signer");
        }

        Ok(())
    }
}
