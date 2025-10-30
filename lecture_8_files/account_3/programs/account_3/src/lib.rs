use anchor_lang::prelude::*;

declare_id!("uQAULnZHSaTYHGMGChN7qqJB342CaBL3PAGpMDLEuUe");

#[program]
pub mod account_3 {
    use super::*;

    // Account structures
    #[account]
    pub struct NftCollection {
        pub authority: Pubkey,
        pub name: String,
        pub symbol: String,
        pub total_minted: u64,
        pub verified: bool,
    }

    #[account]
    pub struct NftVault {
        pub owner: Pubkey,
        pub collection: Pubkey,
        pub vault_name: String,
        pub nft_count: u64,
    }

    // Context structures
    #[derive(Accounts)]
    pub struct CreateCollection<'info> {
        #[account(
            init,
            payer = authority,
            space = 8 + 32 + 64 + 64 + 8 + 1
        )]
        pub collection: Account<'info, NftCollection>,
        #[account(mut)]
        pub authority: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    pub struct CreateVault<'info> {
        #[account(
            init,
            payer = owner,
            space = 8 + 32 + 32 + 64 + 8
        )]
        pub vault: Account<'info, NftVault>,
        pub collection: Account<'info, NftCollection>,
        #[account(mut)]
        pub owner: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    pub struct MintToCollection<'info> {
        #[account(mut)]
        #[account(constraint = collection.authority == authority.key() @ ErrorCode::UnauthorizedMint)]
        pub collection: Account<'info, NftCollection>,
        pub authority: Signer<'info>,
    }

    #[derive(Accounts)]
    pub struct DepositNft<'info> {
        #[account(
            mut,
            constraint = vault.collection == collection.key() @ ErrorCode::WrongCollection
        )]
        pub vault: Account<'info, NftVault>,
        pub collection: Account<'info, NftCollection>,
        pub owner: Signer<'info>,
    }

    #[derive(Accounts)]
    pub struct TransferNftBetweenVaults<'info> {
        #[account(mut)]
        pub source_vault: Account<'info, NftVault>,
        #[account(mut)]
        pub destination_vault: Account<'info, NftVault>,
        pub owner: Signer<'info>,
    }

    // Program instructions
    pub fn create_collection(
        ctx: Context<CreateCollection>,
        name: String,
        symbol: String,
    ) -> Result<()> {
        let collection = &mut ctx.accounts.collection;

        collection.authority = ctx.accounts.authority.key();
        collection.name = name.clone();
        collection.symbol = symbol.clone();
        collection.total_minted = 0;
        collection.verified = false;

        msg!("Collection '{}' ({}) created", name, symbol);
        Ok(())
    }

    pub fn create_vault(ctx: Context<CreateVault>, vault_name: String) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        vault.owner = ctx.accounts.owner.key();
        vault.collection = ctx.accounts.collection.key();
        vault.vault_name = vault_name.clone();
        vault.nft_count = 0;

        msg!(
            "Vault '{}' created for collection '{}'",
            vault_name,
            ctx.accounts.collection.name
        );
        Ok(())
    }

    pub fn mint_nfts_to_collection(ctx: Context<MintToCollection>, amount: u64) -> Result<()> {
        let collection = &mut ctx.accounts.collection;

        collection.total_minted = collection
            .total_minted
            .checked_add(amount)
            .ok_or(ErrorCode::MintOverflow)?;

        msg!("Minted {} NFTs to collection '{}'", amount, collection.name);
        Ok(())
    }

    pub fn deposit_nft_to_vault(
        ctx: Context<DepositNft>,
        nft_mint: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        require!(
            vault.owner == ctx.accounts.owner.key(),
            ErrorCode::UnauthorizedVault
        );

        vault.nft_count = vault
            .nft_count
            .checked_add(1)
            .ok_or(ErrorCode::VaultOverflow)?;

        msg!("Deposited NFT {} to vault '{}'", nft_mint, vault.vault_name);
        Ok(())
    }

    pub fn transfer_nft_between_vaults(
        ctx: Context<TransferNftBetweenVaults>,
        nft_mint: Pubkey,
    ) -> Result<()> {
        msg!("Transferring NFT {} between vaults", nft_mint);

        let source = &mut ctx.accounts.source_vault;
        let destination = &mut ctx.accounts.destination_vault;

        msg!("BEFORE: Source vault '{}' has {} NFTs", source.vault_name, source.nft_count);
        msg!("BEFORE: Destination vault '{}' has {} NFTs", destination.vault_name, destination.nft_count);

        // Validate source has NFTs to transfer
        require!(source.nft_count > 0, ErrorCode::EmptyVault);

        // Validate both vaults are for the same collection
        require!(
            source.collection == destination.collection,
            ErrorCode::CollectionMismatch
        );

        source.nft_count = source
            .nft_count
            .checked_sub(1)
            .ok_or(ErrorCode::VaultUnderflow)?;

        destination.nft_count = destination
            .nft_count
            .checked_add(1)
            .ok_or(ErrorCode::VaultOverflow)?;

        msg!("AFTER: Source vault '{}' has {} NFTs", source.vault_name, source.nft_count);
        msg!("AFTER: Destination vault '{}' has {} NFTs", destination.vault_name, destination.nft_count);

        msg!("Transferring NFT {}", nft_mint);
        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Wrong collection for this vault")]
    WrongCollection,
    #[msg("Unauthorized to mint to this collection")]
    UnauthorizedMint,
    #[msg("Unauthorized to access this vault")]
    UnauthorizedVault,
    #[msg("Cannot transfer from empty vault")]
    EmptyVault,
    #[msg("Vaults must be for the same collection")]
    CollectionMismatch,
    #[msg("Mint overflow")]
    MintOverflow,
    #[msg("Vault overflow")]
    VaultOverflow,
    #[msg("Vault underflow")]
    VaultUnderflow,
}
