const { expect } = require('chai')
const { ethers } = require('hardhat')
const { nowInSeconds } = require('../helpers/time')

const CHARITY_ADDRESS = '0x10E1439455BD2624878b243819E31CfEE9eb721C'
const COMMUNITY_VAULT = '0xFF9774E77966a96b920791968a41aa840DEdE507'
const TWENTY_SEVEN_YEAR_SCAPES = '0x5D3d01a47a62BfF2eB86eBA75F3A23c38dC22fBA'
const WAGMI_TABLE = '0x64Ab884e14DEA5A82C8513c16440Cd6cB40f5eFE'
const PUNKSCAPE = '0x51Ae5e2533854495f6c587865Af64119db8F59b4'
const AKUTI = '0x2D68A6EdEe8323eb9ec0bD421637E7abB7748D98'
const EIGHT_EIGHT_EIGHT = '0x715565Baf69AFcbBE88f56D46F1c9FE2df828705'
const THE_10KTF = '0x7DaEC605E9e2a1717326eeDFd660601e2753A057'

describe('NFPeace', function () {
  let
    NFPeace,
    nfPeaceContract,
    owner,
    person1,
    person2,
    addrs

  before(async () => {
    NFPeace = await ethers.getContractFactory('NFPeace')

    const now = nowInSeconds()
    await hre.network.provider.send('evm_setNextBlockTimestamp', [now])
    await hre.network.provider.send('evm_mine');

    // Get user addresses
    [ owner, person1, person2, ...addrs ] = await ethers.getSigners()
  })

  beforeEach(async () => {
    nfPeaceContract = await NFPeace.deploy()
    await nfPeaceContract.deployed()
  })

  describe('Deployment', () => {
    it('should set core data', async () => {
      expect(await nfPeaceContract.CHARITY_ADDRESS()).to.equal('0x10E1439455BD2624878b243819E31CfEE9eb721C')
      expect(await nfPeaceContract.BIDDING_GRACE_PERIOD()).to.equal(900)
      expect(await nfPeaceContract.BID_PERCENTAGE_INCREASE()).to.equal(10)
      expect(await nfPeaceContract.DEFAULT_STARTING_PRICE()).to.equal('50000000000000000')
    })
  })

  describe('Auctions', () => {
    let cv
    let twentySevenYearScapesContract
    let wagmiTableContract
    let punkscapeContract

    const startAuction = (id = 7374) => punkscapeContract.connect(cv)[`safeTransferFrom(address,address,uint256)`](
      COMMUNITY_VAULT,
      nfPeaceContract.address,
      id
    )

    before(async () => {
      await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [COMMUNITY_VAULT],
      })
      cv = await ethers.getSigner(COMMUNITY_VAULT)

      twentySevenYearScapesContract = await ethers.getContractAt('IERC721', TWENTY_SEVEN_YEAR_SCAPES)
      wagmiTableContract = await ethers.getContractAt('IERC721', WAGMI_TABLE)
      punkscapeContract = await ethers.getContractAt('IERC721', PUNKSCAPE)
    })

    describe('Initialize ERC721', () => {
      it('Receives an ERC721 NFT and initialises the auction', async () => {
        const now = nowInSeconds()
        await expect(await punkscapeContract
          .connect(cv)[`safeTransferFrom(address,address,uint256)`](
            COMMUNITY_VAULT,
            nfPeaceContract.address,
            8433)
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(0)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.tokenContract).to.equal(punkscapeContract.address)
        expect(auction.tokenId).to.equal(8433)
        expect(auction.latestBidder).to.equal(COMMUNITY_VAULT)
        expect(auction.latestBid).to.equal(0)
        expect(auction.startingPrice).to.equal(ethers.utils.parseEther('0.05'))
        // test _now_ + 24h to actual endAuction delta sould be less than 20 seconds
        expect(auction.endTimestamp - (now + 24 * 60 * 60)).to.be.lessThan(20)
        expect(auction.tokenERCStandard).to.equal(721)
        expect(auction.tokenAmount).to.equal(1)
        expect(auction.settled).to.equal(false)

        // Make sure that auction ID properly increments
        await expect(await punkscapeContract
          .connect(cv)[`safeTransferFrom(address,address,uint256)`](
            COMMUNITY_VAULT,
            nfPeaceContract.address,
            2676)
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(1)
      })

      it('Receives an ERC721 NFT and initialises the auction without a custom starting price', async () => {
        await expect(await punkscapeContract
          .connect(cv)[`safeTransferFrom(address,address,uint256,bytes)`](
            COMMUNITY_VAULT,
            nfPeaceContract.address,
            9185,
            ethers.utils.arrayify(ethers.BigNumber.from('0'))
          )
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(0)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.startingPrice).to.equal(ethers.utils.parseEther('0.05'))
      })

      it('Receives an ERC721 NFT and initialises the auction with a custom starting price', async () => {
        await expect(await twentySevenYearScapesContract
          .connect(cv)[`safeTransferFrom(address,address,uint256,bytes)`](
            COMMUNITY_VAULT,
            nfPeaceContract.address,
            19,
            ethers.utils.arrayify(ethers.utils.parseEther('2'))
          )
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(0)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.startingPrice).to.equal(ethers.utils.parseEther('2'))
      })

      it(`Doesn't initialize the auction if the provided starting price is out of range...`, async () => {
        await expect(
          wagmiTableContract
            .connect(cv)[`safeTransferFrom(address,address,uint256,bytes)`](
              COMMUNITY_VAULT,
              nfPeaceContract.address,
              129,
              ethers.utils.arrayify(ethers.utils.parseEther('19'))
            )
        ).to.be.revertedWith('toUint64_outOfBounds')
      })
    })

    describe('Initialize ERC1155', () => {
      let akuti
      let eightEightEightContract
      let the10KTFContract

      before(async () => {
        await owner.sendTransaction({
          to: AKUTI,
          value: ethers.utils.parseEther('10'),
        })
      })

      beforeEach(async () => {
        await hre.network.provider.request({
          method: 'hardhat_impersonateAccount',
          params: [AKUTI],
        })
        akuti = await ethers.getSigner(AKUTI)

        eightEightEightContract = await ethers.getContractAt('IERC1155', EIGHT_EIGHT_EIGHT)
        the10KTFContract = await ethers.getContractAt('IERC1155', THE_10KTF)
      })

      it('Receives one ERC1155 NFT and initialises the auction', async () => {
        const now = nowInSeconds()
        await expect(await eightEightEightContract
          .connect(akuti).safeTransferFrom(
            AKUTI, // from
            nfPeaceContract.address, // to
            1, // id
            1, // amount
            ethers.utils.arrayify(0) // data
          )
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(0)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.tokenContract).to.equal(eightEightEightContract.address)
        expect(auction.tokenId).to.equal(1)
        expect(auction.latestBidder).to.equal(AKUTI)
        expect(auction.latestBid).to.equal(0)
        expect(auction.startingPrice).to.equal(ethers.utils.parseEther('0.05'))
        // test _now_ + 24h to actual endAuction delta sould be less than 20 seconds
        expect(auction.endTimestamp - (now + 24 * 60 * 60)).to.be.lessThan(20)
        expect(auction.tokenERCStandard).to.equal(1155)
        expect(auction.tokenAmount).to.equal(1)
        expect(auction.settled).to.equal(false)
      })

      it('Receives multiple ERC1155 NFT and initialises the auction', async () => {
        await expect(await eightEightEightContract
          .connect(akuti).safeTransferFrom(
            AKUTI, // from
            nfPeaceContract.address, // to
            1, // id
            2, // amount
            ethers.utils.arrayify(0) // data
          )
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(0)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.tokenAmount).to.equal(2)
      })

      it('Receives multiple batch ERC1155 NFTs and initialises the auction for each with a custom price', async () => {
        await expect(await the10KTFContract
          .connect(akuti).safeBatchTransferFrom(
            AKUTI, // from
            nfPeaceContract.address, // to
            [2, 4], // id
            [1, 1], // amount
            ethers.utils.arrayify(ethers.utils.parseEther('5')) // data
          )
        )
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(0)
          .to.emit(nfPeaceContract, 'AuctionInitialised')
          .withArgs(1)

        const auction1 = await nfPeaceContract.getAuction(0)
        expect(auction1.tokenId).to.equal(2)
        expect(auction1.startingPrice).to.equal(ethers.utils.parseEther('5'))
        const auction2 = await nfPeaceContract.getAuction(1)
        expect(auction2.tokenId).to.equal(4)
        expect(auction2.startingPrice).to.equal(ethers.utils.parseEther('5'))
      })
    })

    describe('Bids', () => {
      it('should allow bids on started auctions and update the current price afterwards', async () => {
        await startAuction(7374)
        const value = ethers.utils.parseEther('0.2')

        await expect(nfPeaceContract.connect(person1).bid(0, { value }))
          .to.emit(nfPeaceContract, 'Bid')
          .withArgs(0, value, person1.address)

          expect(await nfPeaceContract.currentBidPrice(0)).to.equal(ethers.utils.parseEther('0.25'))
          const auction = await nfPeaceContract.getAuction(0)
          expect(auction.latestBidder).to.equal(person1.address)
          expect(auction.latestBid).to.equal(ethers.utils.parseEther('0.2'))
          expect(auction.settled).to.equal(false)
      })

      it('should extend the auction time if a bid is placed within the last 15 minutes of an auction', async () => {
        let block = await ethers.provider.getBlock('latest')
        await startAuction(4804)

        let value = ethers.utils.parseEther('0.2')
        await nfPeaceContract.connect(person1).bid(0, { value })

        block = await ethers.provider.getBlock('latest')

        const secondsUntilAlmost24Hours = 23 * 60 * 60 + 55 * 60

        await hre.network.provider.send('evm_increaseTime', [secondsUntilAlmost24Hours])
        await hre.network.provider.send('evm_mine')

        value = ethers.utils.parseEther('0.3')
        await expect(nfPeaceContract.connect(person2).bid(0, { value }))
          .to.emit(nfPeaceContract, 'AuctionExtended')
        block = await ethers.provider.getBlock('latest')
        in15Minutes = block.timestamp + 900
        expect((await nfPeaceContract.getAuction(0)).endTimestamp).to.equal(in15Minutes)

        const another15Minutes = 920
        await hre.network.provider.send('evm_increaseTime', [another15Minutes])
        await hre.network.provider.send('evm_mine')

        value = ethers.utils.parseEther('0.4')
        await expect(nfPeaceContract.connect(person1).bid(0, { value }))
          .to.be.revertedWith('Auction is not active.')
      })

      it('should pay back previous bidders on new bids', async () => {
        await startAuction(6954)

        let value = ethers.utils.parseEther('0.2')
        await nfPeaceContract.connect(person1).bid(0, { value })

        value = ethers.utils.parseEther('0.3')
        await expect(await nfPeaceContract.connect(person2).bid(0, { value }))
          .to.changeEtherBalance(person1, ethers.utils.parseEther('0.2'))
      })
    })

    describe('Settle', () => {
      it('should not allow someone to settle an auction before it is complete', async () => {
        await startAuction(9898)

        await expect(nfPeaceContract.connect(person1).settle(0))
          .to.be.revertedWith('Auction not complete.')
      })

      it('should allow someone to settle the auction when it is complete with bids', async () => {
        await startAuction(3210)

        let value = ethers.utils.parseEther('0.2')
        await nfPeaceContract.connect(person1).bid(0, { value })

        const afterAuction = 24 * 60 * 60 + 20 // 24h and 20s
        await hre.network.provider.send('evm_increaseTime', [afterAuction])
        await hre.network.provider.send('evm_mine')

        const charityBalance = await ethers.provider.getBalance(CHARITY_ADDRESS)

        await expect(await nfPeaceContract.connect(person2).settle(0))
          .to.emit(nfPeaceContract, 'AuctionSettled')
          .withArgs(0)

        expect(await ethers.provider.getBalance(CHARITY_ADDRESS)).to.equal(charityBalance.add(value))
        expect(await punkscapeContract.ownerOf(3210)).to.equal(person1.address)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.latestBidder).to.equal(person1.address)
        expect(auction.latestBid).to.equal(ethers.utils.parseEther('0.2'))
        expect(auction.settled).to.equal(true)

        await expect(nfPeaceContract.connect(person2).settle(0))
          .to.be.revertedWith('Auction already settled.')
      })

      it('should allow someone to settle the auction when it is complete without bids', async () => {
        await startAuction(4735)

        const afterAuction = 24 * 60 * 60 + 20 // 24h and 20s
        await hre.network.provider.send('evm_increaseTime', [afterAuction])
        await hre.network.provider.send('evm_mine')

        const charityBalance = await ethers.provider.getBalance(CHARITY_ADDRESS)

        await expect(await nfPeaceContract.connect(person1).settle(0))
          .to.emit(nfPeaceContract, 'AuctionSettled')
          .withArgs(0)

        expect(await ethers.provider.getBalance(CHARITY_ADDRESS)).to.equal(charityBalance)
        expect(await punkscapeContract.ownerOf(4735)).to.equal(COMMUNITY_VAULT)

        const auction = await nfPeaceContract.getAuction(0)
        expect(auction.latestBidder).to.equal(COMMUNITY_VAULT)
        expect(auction.latestBid).to.equal(ethers.utils.parseEther('0'))
        expect(auction.settled).to.equal(true)
      })

      it(`should not allow anyone to settle an auction that doesn't exist`, async () => {
        await expect(nfPeaceContract.connect(person1).settle(0))
          .to.be.revertedWith('Auction does not exist.')
      })
    })
  })
})
