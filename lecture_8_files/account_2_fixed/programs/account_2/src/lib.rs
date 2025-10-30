use anchor_lang::prelude::*;

declare_id!("8BLtq6aCTfzCPCCw5xEVKunP3Xp445xxA1XboqzbAnAc");

#[program]
pub mod account_2 {
    use super::*;

    // Account structures
    #[account]
    pub struct UserProfile {
        pub authority: Pubkey,
        pub username: String,
        pub nft_count: u64,
        pub total_sales: u64,
        pub is_active: bool,
        pub bump: u8,
    }

    // Context structures
    #[derive(Accounts)]
    #[instruction(username: String)]
    pub struct InitializeProfile<'info> {
        #[account(
            init,
            payer = authority,
            space = 8 + 32 + (4 + 32) + 8 + 8 + 1 + 1,
            seeds = [b"profile", authority.key().as_ref()],
            bump
        )]
        pub user_profile: Account<'info, UserProfile>,
        #[account(mut)]
        pub authority: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    pub struct UpdateProfileAuthority<'info> {
        #[account(
            mut,
            has_one = authority
        )]
        pub user_profile: Account<'info, UserProfile>,
        /// CHECK: New authority to set
        pub new_authority: UncheckedAccount<'info>,
        // FIXED: Now requires signature from current authority
        pub authority: Signer<'info>,
    }

    #[derive(Accounts)]
    pub struct ListNft<'info> {
        #[account(mut)]
        pub user_profile: Account<'info, UserProfile>,
        pub authority: Signer<'info>,
    }

    // Program instructions
    pub fn initialize_profile(ctx: Context<InitializeProfile>, username: String) -> Result<()> {
        let profile = &mut ctx.accounts.user_profile;

        profile.authority = ctx.accounts.authority.key();
        profile.username = username;
        profile.nft_count = 0;
        profile.total_sales = 0;
        profile.is_active = true;
        profile.bump = ctx.bumps.user_profile;

        msg!("Profile initialized for user: {}", profile.username);
        Ok(())
    }

    pub fn update_profile_authority(ctx: Context<UpdateProfileAuthority>) -> Result<()> {
        let profile = &mut ctx.accounts.user_profile;

        // FIXED: Authority is now required to sign the transaction
        msg!(
            "Updating profile authority from {} to {}",
            profile.authority,
            ctx.accounts.new_authority.key()
        );

        profile.authority = ctx.accounts.new_authority.key();
        msg!("Profile authority updated successfully");
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
