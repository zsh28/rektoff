use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("4CQhKWx8yrV8Jp5yJ55NubNKTqUoFsd4CuakRzyVka3W");

#[program]
pub mod exercise_10 {
    use super::*;

    // ============================================================================
    // Account Structures
    // ============================================================================

    #[account]
    pub struct NftListing {
        pub seller: Pubkey,
        pub seller_token_account: Pubkey,
        pub price: u64,        // Price in tokens
        pub is_active: bool,
        pub bump: u8,
    }

    // ============================================================================
    // Context Structures
    // ============================================================================

    #[derive(Accounts)]
    pub struct Initialize {}

    #[derive(Accounts)]
    pub struct CreateListing<'info> {
        #[account(
            init,
            payer = seller,
            space = 8 + 32 + 32 + 8 + 1 + 1, // discriminator + seller + seller_token_account + price + is_active + bump
            seeds = [b"listing", seller.key().as_ref(), seller_token_account.key().as_ref()],
            bump
        )]
        pub listing: Account<'info, NftListing>,

        #[account(
            constraint = seller_token_account.owner == seller.key()
        )]
        pub seller_token_account: Account<'info, TokenAccount>,

        #[account(mut)]
        pub seller: Signer<'info>,
        
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    pub struct PurchaseNft<'info> {
        #[account(
            mut,
            seeds = [b"listing", listing.seller.as_ref(), listing.seller_token_account.as_ref()],
            bump = listing.bump,
            constraint = listing.is_active @ MarketplaceError::ListingNotActive
        )]
        pub listing: Box<Account<'info, NftListing>>,

        #[account(
            mut,
            constraint = buyer_token_account.owner == buyer.key()
        )]
        pub buyer_token_account: Account<'info, TokenAccount>,

        #[account(
            mut,
            constraint = escrow_token_account.mint == buyer_token_account.mint
        )]
        pub escrow_token_account: Account<'info, TokenAccount>,

        #[account(mut)]
        pub buyer: Signer<'info>,

        pub token_program: Program<'info, Token>,
    }

    // ============================================================================
    // Program Instructions
    // ============================================================================

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        msg!("NFT Marketplace initialized");
        Ok(())
    }

    pub fn create_listing(ctx: Context<CreateListing>, price: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;

        listing.seller = ctx.accounts.seller.key();
        listing.seller_token_account = ctx.accounts.seller_token_account.key();
        listing.price = price;
        listing.is_active = true;
        listing.bump = ctx.bumps.listing;

        msg!("Created listing at price {} tokens", price);
        Ok(())
    }

    /// Purchase NFT with token transfer
    pub fn purchase_nft_vulnerable(ctx: Context<PurchaseNft>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        
        msg!("=== PURCHASE STARTING ===");
        msg!("Purchase price: {} tokens", listing.price);

        // Read TokenAccount balances before the transfer CPI
        let buyer_token_balance_before = ctx.accounts.buyer_token_account.amount;
        let escrow_token_balance_before = ctx.accounts.escrow_token_account.amount;
        
        msg!("Buyer token balance before CPI: {}", buyer_token_balance_before);
        msg!("Escrow token balance before CPI: {}", escrow_token_balance_before);

        // Validate buyer has enough tokens
        require!(
            buyer_token_balance_before >= listing.price,
            MarketplaceError::InsufficientFunds
        );

        // Make CPI to transfer tokens from buyer to escrow
        let transfer_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        );

        token::transfer(cpi_ctx, listing.price)?;

        msg!("=== CPI TRANSFER COMPLETED ===");

        ctx.accounts.buyer_token_account.reload()?;
        ctx.accounts.escrow_token_account.reload()?;

        // Read TokenAccount balances after CPI
        let buyer_token_balance_after = ctx.accounts.buyer_token_account.amount;
        let escrow_token_balance_after = ctx.accounts.escrow_token_account.amount;
   
        msg!("Buyer token balance after CPI: {}", buyer_token_balance_after);
        msg!("Escrow token balance after CPI: {}", escrow_token_balance_after);

        // Calculate transaction amounts
        let buyer_spent = buyer_token_balance_before - buyer_token_balance_after;
        let escrow_received = escrow_token_balance_after - escrow_token_balance_before;
        
        msg!("Calculated buyer spent: {}", buyer_spent);
        msg!("Calculated escrow received: {}", escrow_received);

        msg!("=== VERIFYING TRANSACTION ===");
        msg!("Expected transfer amount: {}", listing.price);
        msg!("Calculated escrow received: {}", escrow_received);

        if escrow_received != listing.price {
            msg!("Validation: Expected {} tokens, but calculated {}", listing.price, escrow_received);
            return Err(error!(MarketplaceError::TransferAmountMismatch));
        }

        // Complete the sale
        listing.is_active = false;
        
        msg!("=== PURCHASE COMPLETED ===");
        Ok(())
    }
}

// ============================================================================
// Error Codes
// ============================================================================

#[error_code]
pub enum MarketplaceError {
    #[msg("Insufficient funds to complete purchase")]
    InsufficientFunds,
    
    #[msg("Transfer amount does not match expected amount")]
    TransferAmountMismatch,
    
    #[msg("Escrow balance does not match expected amount")]
    EscrowBalanceMismatch,
    
    #[msg("Listing is not active")]
    ListingNotActive,
}
