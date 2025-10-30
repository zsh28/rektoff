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
        #[account(mut)]
        /// CHECK: User profile account
        pub user_profile: UncheckedAccount<'info>,
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

        let user_profile = &ctx.accounts.user_profile;
        let mut data = user_profile.data.borrow_mut();

        // Write account discriminator
        let discriminator = <UserProfile as anchor_lang::Discriminator>::DISCRIMINATOR;
        data[..8].copy_from_slice(&discriminator);

        // Create profile data
        let profile = UserProfile {
            authority: ctx.accounts.authority.key(),
            username,
            nft_count: 0,
            total_sales: 0,
            is_active: true,
        };

        // Serialize and write profile data
        use std::io::Cursor;
        let mut cursor = Cursor::new(&mut data[8..]);
        profile.serialize(&mut cursor)?;

        msg!("Profile initialized for authority: {}", profile.authority);
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
