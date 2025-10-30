use anchor_lang::prelude::*;

declare_id!("CpYcbxcxbtzo6K4eKVFstc9kaqz7Vg5p9MjpipRJngHy");

#[program]
pub mod account_1 {
    use super::*;

    // Account structures
    #[account]
    pub struct UserProfile {
        pub authority: Pubkey,
        pub username: String,
        pub nft_count: u64,
        pub total_sales: u64,
        pub is_active: bool,
    }

    // Context structures
    #[derive(Accounts)]
    pub struct InitUserProfile<'info> {
        #[account(
            init,
            payer = authority,
            space = 8 + 32 + (4 + 32) + 8 + 8 + 1,
            seeds = [b"profile", authority.key().as_ref()],
            bump
        )]
        pub user_profile: Account<'info, UserProfile>,
        
        #[account(mut)]                                      
        pub authority: Signer<'info>,                        
        
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    pub struct ListNft<'info> {
        #[account(mut)]
        pub user_profile: Account<'info, UserProfile>,
        pub authority: Signer<'info>,
    }

    // Program instructions
    pub fn initialize_user_profile(ctx: Context<InitUserProfile>, username: String) -> Result<()> {
        msg!("Initializing user profile: {}", username);

        // FIXED: Anchor's 'init' constraint ensures account is new and safe
        let user_profile = &mut ctx.accounts.user_profile;

        user_profile.authority = ctx.accounts.authority.key();
        user_profile.username = username.clone();
        user_profile.nft_count = 0;
        user_profile.total_sales = 0;
        user_profile.is_active = true;

        msg!("Profile initialized for authority: {}", user_profile.authority);
        Ok(())
    }

    pub fn list_nft(ctx: Context<ListNft>, price: u64, nft_mint: Pubkey) -> Result<()> {
        let profile = &mut ctx.accounts.user_profile;

        // Check profile ownership
        require!(
            profile.authority == ctx.accounts.authority.key(),
            MarketplaceError::Unauthorized
        );

        profile.nft_count += 1;
        msg!("NFT {} listed for {} lamports", nft_mint, price);
        Ok(())
    }
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Unauthorized")]
    Unauthorized,
}
