use anchor_lang::prelude::*;

declare_id!("5vLwqKbQySVMBASDCC88rgJpxPifbFatP6R7vLwAZzmi");

#[program]
pub mod account_4 {
    use super::*;

    // Account structures
    #[account]
    pub struct CollectionAuthority {
        pub collection_id: u64,
        pub collection_name: String,
        pub can_mint: u64,
    }

    #[account]
    pub struct UserVault {
        pub user_id: u64,
        pub vault_name: String,
        pub balance: u64,
    }

    #[account]
    pub struct VaultAuthority {
        pub user_id: u64,
        pub vault_name: String,
    }

    // Context structures
    #[derive(Accounts)]
    #[instruction(collection_id: u64, collection_name: String)]
    pub struct InitializeCollectionAuthority<'info> {
        #[account(
            init,
            payer = payer,
            space = 8 + 8 + 4 + collection_name.len() + 8,
            seeds = [
                b"authority", 
                collection_id.to_le_bytes().as_ref(),
                collection_name.as_bytes()
            ],
            bump
        )]
        pub collection_authority: Account<'info, CollectionAuthority>,
        #[account(mut)]
        pub payer: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    #[instruction(user_id: u64, vault_name: String)]
    pub struct InitializeUserVault<'info> {
        #[account(
            init,
            payer = payer,
            space = 8 + 8 + 4 + vault_name.len() + 8,
            seeds = [
                b"user_vault", 
                user_id.to_le_bytes().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,

        /// PDA for vault authority unique to each user vault
        #[account(
            init,
            payer = payer,
            space = 8 + 8 + 4 + vault_name.len() + 8,
            seeds = [
                b"vault_authority",
                user_id.to_le_bytes().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub vault_authority: Account<'info, VaultAuthority>,
        #[account(mut)]
        pub payer: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    #[instruction(collection_id: u64, collection_name: String)]
    pub struct MintNft<'info> {
        #[account(
            seeds = [
                b"authority", 
                collection_id.to_le_bytes().as_ref(),
                collection_name.as_bytes()
            ],
            bump
        )]
        pub collection_authority: Account<'info, CollectionAuthority>,
        #[account(mut)]
        pub minter: Signer<'info>,
    }

    #[derive(Accounts)]
    #[instruction(user_id: u64, vault_name: String)]
    pub struct DepositToVault<'info> {
        #[account(
            mut,
            seeds = [
                b"user_vault", 
                user_id.to_le_bytes().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,
        #[account(mut)]
        pub user: Signer<'info>,
    }

    #[derive(Accounts)]
    #[instruction(user_id: u64, vault_name: String)]
    pub struct WithdrawFromVault<'info> {
        #[account(
            mut,
            seeds = [
                b"user_vault", 
                user_id.to_le_bytes().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,
        // FIXED: Using proper seeds that don't collide with collection authority
        #[account(
            seeds = [
                b"vault_authority", 
                user_id.to_le_bytes().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub vault_authority: Account<'info, VaultAuthority>,
        #[account(mut)]
        pub user: Signer<'info>,
    }

    // Program instructions
    pub fn initialize_collection_authority(
        ctx: Context<InitializeCollectionAuthority>,
        collection_id: u64,
        collection_name: String,
    ) -> Result<()> {
        let authority = &mut ctx.accounts.collection_authority;
        authority.collection_id = collection_id;
        authority.collection_name = collection_name;
        authority.can_mint = 1;
        Ok(())
    }

    pub fn initialize_user_vault(
        ctx: Context<InitializeUserVault>,
        user_id: u64,
        vault_name: String,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.user_vault;
        vault.user_id = user_id;
        vault.vault_name = vault_name;
        vault.balance = 0;
        Ok(())
    }

    pub fn mint_nft(
        ctx: Context<MintNft>,
        collection_id: u64,
        collection_name: String,
    ) -> Result<()> {
        msg!(
            "Minting NFT for collection {} with ID {}",
            collection_name,
            collection_id
        );
        Ok(())
    }

    pub fn deposit_to_vault(
        ctx: Context<DepositToVault>,
        user_id: u64,
        vault_name: String,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.user_vault;

        vault.balance += amount;

        msg!(
            "Deposited {} tokens to vault '{}' for user {}",
            amount,
            vault_name,
            user_id
        );
        Ok(())
    }

    pub fn withdraw_from_vault(
        ctx: Context<WithdrawFromVault>,
        user_id: u64,
        vault_name: String,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.user_vault;

        require!(vault.balance >= amount, ErrorCode::InsufficientBalance);

        vault.balance -= amount;

        msg!(
            "Withdrew {} tokens from vault '{}' for user {}",
            amount,
            vault_name,
            user_id
        );
        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient balance")]
    InsufficientBalance,
}
