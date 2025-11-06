use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

declare_id!("7MQ9tPRqtfDycAqY8SCNTZzFFySK16mMZ4Wgz5md9ch2");

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
    pub struct PurchaseNftWithRoyalties<'info> {
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

        /// CHECK: This account will be used for royalty distribution
        pub royalty_program: AccountInfo<'info>,

        /// CHECK: Seller account for payment processing
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

    /// Purchase an NFT with royalty distribution
    pub fn purchase_nft_with_royalties<'info>(
        ctx: Context<'_, '_, '_, 'info, PurchaseNftWithRoyalties<'info>>,
        royalty_percentage: u8,
    ) -> Result<()> {
        msg!("Starting purchase_nft_with_royalties");
        msg!("Royalty program: {}", ctx.accounts.royalty_program.key());

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
            "Transferring {} lamports from buyer to escrow",
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
            "Transfer completed, escrow balance: {}",
            ctx.accounts.escrow.balance
        );

        // We need to distribute the royalties
        //Calculate the Anchor instruction discriminator for "distribute_royalties"
        let discriminator =
            &anchor_lang::solana_program::hash::hash(b"global:distribute_royalties").to_bytes()
                [0..8];

        // Create the instruction data
        let mut instruction_data = Vec::new();
        instruction_data.extend_from_slice(discriminator);
        instruction_data.extend_from_slice(&royalty_amount.to_le_bytes());

        // Create the CPI instruction for royalty distribution
        let royalty_instruction = Instruction {
            program_id: ctx.accounts.royalty_program.key(),// this is the royalty program
            accounts: vec![
                AccountMeta::new(ctx.accounts.buyer.key(), true),
                AccountMeta::new(ctx.accounts.escrow.key(), false),
                AccountMeta::new_readonly(ctx.accounts.seller.key(), false),
                AccountMeta::new_readonly(listing.key(), false),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            data: instruction_data,
        };

        msg!("Executing royalty distribution");
        msg!("Calling program: {}", ctx.accounts.royalty_program.key());
        msg!("With buyer as signer: {}", ctx.accounts.buyer.key());

        // Execute the CPI call for royalty distribution
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
                msg!("CPI completed successfully");
            }
            Err(e) => {
                return Err(e.into());
            }
        }

        msg!("Purchase completed successfully");
        Ok(())
    }
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Invalid royalty percentage")]
    InvalidRoyalty,
    #[msg("Untrusted royalty program")]
    UntrustedRoyaltyProgram,
}
