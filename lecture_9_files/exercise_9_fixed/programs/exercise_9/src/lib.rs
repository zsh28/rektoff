use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

declare_id!("H4fFbjuy9JrqH8TqmQWibV3646kqzqjSzLjx6tkzqvrw");

// 🛡️ LEGITIMATE ROYALTY PROGRAM ID 🛡️
const TRUSTED_ROYALTY_PROGRAM: &str = "8GQBYWVbgsZvem5Vef4SiL5YmD1pgAkxMnB5NBydF5HQ";

#[program]
pub mod exercise_9 {
    use super::*;

    // ============================================================================
    // Account Structures
    // ============================================================================

    #[account]
    pub struct NftListing {
        pub seller: Pubkey,
        pub nft_mint: Pubkey,
        pub price: u64,
        pub is_active: bool,
        pub bump: u8,
    }

    #[account]
    pub struct MarketplaceEscrow {
        pub seller: Pubkey,
        pub nft_mint: Pubkey,
        pub balance: u64,
        pub bump: u8,
    }

    // ============================================================================
    // Context Structures
    // ============================================================================

    #[derive(Accounts)]
    #[instruction(nft_mint: Pubkey)]
    pub struct CreateListing<'info> {
        #[account(
            init,
            payer = seller,
            space = 8 + 32 + 32 + 8 + 1 + 1,
            seeds = [b"listing", seller.key().as_ref(), nft_mint.as_ref()],
            bump
        )]
        pub listing: Account<'info, NftListing>,

        #[account(
            init,
            payer = seller,
            space = 8 + 32 + 32 + 8 + 1,
            seeds = [b"escrow", seller.key().as_ref(), nft_mint.as_ref()],
            bump
        )]
        pub escrow: Account<'info, MarketplaceEscrow>,

        #[account(mut)]
        pub seller: Signer<'info>,
        pub system_program: Program<'info, System>,
    }


    #[derive(Accounts)]
    pub struct PurchaseNftWithRoyaltiesSafe<'info> {
        #[account(
            mut,
            seeds = [b"listing", listing.seller.as_ref(), listing.nft_mint.as_ref()],
            bump = listing.bump
        )]
        pub listing: Account<'info, NftListing>,

        #[account(
            mut,
            seeds = [b"escrow", listing.seller.as_ref(), listing.nft_mint.as_ref()],
            bump = escrow.bump
        )]
        pub escrow: Account<'info, MarketplaceEscrow>,

        #[account(mut)]
        pub buyer: Signer<'info>,

        /// 🛡️ VALIDATED ROYALTY PROGRAM - Only trusted program accepted
        /// CHECK: This is a valid program that is whitelisted
        #[account(
            constraint = royalty_program.key().to_string() == TRUSTED_ROYALTY_PROGRAM @ MarketplaceError::UntrustedRoyaltyProgram
        )]
        pub royalty_program: AccountInfo<'info>,

        /// CHECK: Seller doesn't need to be a signer for purchase
        #[account(mut)]
        pub seller: AccountInfo<'info>,

        pub system_program: Program<'info, System>,
    }

    // ============================================================================
    // Program Instructions
    // ============================================================================

    /// Creates an NFT listing on the marketplace
    pub fn create_listing(ctx: Context<CreateListing>, nft_mint: Pubkey, price: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let escrow = &mut ctx.accounts.escrow;

        listing.seller = ctx.accounts.seller.key();
        listing.nft_mint = nft_mint;
        listing.price = price;
        listing.is_active = true;
        listing.bump = ctx.bumps.listing;

        escrow.seller = ctx.accounts.seller.key();
        escrow.nft_mint = nft_mint;
        escrow.balance = 0;
        escrow.bump = ctx.bumps.escrow;

        msg!("Created listing for NFT {} at price {}", nft_mint, price);
        Ok(())
    }

   
    /// 🛡️ SECURE FUNCTION: Fixed Confused Deputy Vulnerability
    ///
    /// This function provides the same functionality but with proper validation
    /// to prevent the confused deputy attack by only accepting trusted royalty programs.
    pub fn purchase_nft_with_royalties_safe<'info>(
        ctx: Context<'_, '_, '_, 'info, PurchaseNftWithRoyaltiesSafe<'info>>,
        royalty_percentage: u8,
    ) -> Result<()> {
        msg!("🛡️ SECURE MARKETPLACE: Starting purchase_nft_with_royalties_safe");
        msg!("✅ Validated royalty program: {}", ctx.accounts.royalty_program.key());
        msg!("✅ Expected trusted program: {}", TRUSTED_ROYALTY_PROGRAM);

        let listing = &ctx.accounts.listing;

        require!(listing.is_active, MarketplaceError::ListingNotActive);
        require!(royalty_percentage <= 100, MarketplaceError::InvalidRoyalty);

        let total_price = listing.price;
        let royalty_amount = (total_price * royalty_percentage as u64) / 100;
        let seller_amount = total_price - royalty_amount;

        msg!(
            "Total price: {}, Royalty amount: {}, Seller amount: {}",
            total_price,
            royalty_amount,
            seller_amount
        );

        // Transfer payment from buyer to escrow
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &ctx.accounts.escrow.key(),
            total_price,
        );

        msg!(
            "💰 Transferring {} lamports from buyer to escrow",
            total_price
        );

        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        ctx.accounts.escrow.balance += total_price;
        msg!(
            "💰 Transfer completed, escrow balance: {}",
            ctx.accounts.escrow.balance
        );

        // 🛡️ SECURE CPI: Only calls validated trusted royalty program
        msg!("🛡️ SECURITY: Making CPI to VALIDATED trusted program: {}", ctx.accounts.royalty_program.key());
        msg!("✅ SAFE: Program has been validated against trusted whitelist");

        // Calculate the Anchor instruction discriminator for "distribute_royalties"
        let discriminator =
            &anchor_lang::solana_program::hash::hash(b"global:distribute_royalties").to_bytes()
                [0..8];

        // Create properly formatted instruction data: discriminator + parameters
        let mut instruction_data = Vec::new();
        instruction_data.extend_from_slice(discriminator);
        instruction_data.extend_from_slice(&royalty_amount.to_le_bytes());

        // Create the CPI instruction for "royalty distribution"
        // ✅ THIS IS THE SECURE CPI CALL ✅
        let royalty_instruction = Instruction {
            program_id: ctx.accounts.royalty_program.key(),
            accounts: vec![
                AccountMeta::new(ctx.accounts.buyer.key(), true), // Buyer as signer (safe with trusted program)
                AccountMeta::new(ctx.accounts.escrow.key(), false), // Escrow account
                AccountMeta::new_readonly(ctx.accounts.seller.key(), false), // Seller
                AccountMeta::new_readonly(listing.key(), false),  // Listing
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false), // System program
            ],
            data: instruction_data,
        };

        msg!("✅ EXECUTING SECURE CPI!");
        msg!("✅ Calling TRUSTED program: {}", ctx.accounts.royalty_program.key());
        msg!("✅ With buyer as signer (SAFE): {}", ctx.accounts.buyer.key());

        // ✅ THE SECURE CPI CALL ✅
        // This only calls the validated trusted royalty program!
        let result = anchor_lang::solana_program::program::invoke(
            &royalty_instruction,
            &[
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.listing.to_account_info(),
            ],
        );

        match result {
            Ok(_) => {
                msg!("✅ SECURE CPI COMPLETED SUCCESSFULLY!");
                msg!("✅ Buyer paid exact royalty amount to legitimate program");
            }
            Err(e) => {
                return Err(e.into());
            }
        }

        msg!("🛡️ Secure purchase completed successfully!");
        Ok(())
    }
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Invalid royalty percentage")]
    InvalidRoyalty,
    #[msg("Untrusted royalty program - only whitelisted programs allowed")]
    UntrustedRoyaltyProgram,
}
