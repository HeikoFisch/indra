pragma solidity 0.5.11;
pragma experimental "ABIEncoderV2";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../adjudicator/interfaces/CounterfactualApp.sol";
import "../funding/libs/LibOutcome.sol";


/// @title Lightning HTLC Transfer App
/// @notice This contract allows users to claim a payment locked in
///         the application if they provide a preImage and timelock
///         that corresponds to a lightning htlc
contract HashLockTransferApp is CounterfactualApp {

    /**
    * This app can also not be used to send _multiple_ hashlocked payments,
    * only one can be redeemed with the preImage.
    */
    struct AppState {
        LibOutcome.CoinTransfer[2] coinTransfers;
        bytes32 lockHash;
        bytes32 preImage;
        uint256 timelock;
        uint256 turnNum; // even is receiver?
        bool finalized;
    }

    struct Action {
        bytes32 preImage;
    }

    function applyAction(
        bytes calldata encodedState,
        bytes calldata encodedAction
    )
        external
        view
        returns (bytes memory)
    {
        AppState memory state = abi.decode(encodedState, (AppState));
        Action memory action = abi.decode(encodedAction, (Action));
        bytes32 generatedHash = sha256(abi.encode(action.preImage));

        require(!state.finalized, "Cannot take action on finalized state");
        require(state.timelock <= block.number, "Cannot take action if timelock is expired");
        require(state.lockHash == generatedHash, "Hash generated from preimage does not match hash in state");
        
        state.coinTransfers[1].amount = state.coinTransfers[0].amount;
        state.coinTransfers[0].amount = 0;
        state.preImage = action.preImage;
        state.finalized = true;
        state.turnNum += 1;

        return abi.encode(state);
    }

    function computeOutcome(bytes calldata encodedState)
        external
        view
        returns (bytes memory)
    {
        AppState memory state = abi.decode(encodedState, (AppState));

        // If payment hasn't been unlocked, require that the timelock is expired
        if (!state.finalized) {
            require(state.timelock > block.number, "Cannot revert payment if timelock is unexpired");
        }

        return abi.encode(state.coinTransfers);
    }

    function getTurnTaker(
        bytes calldata encodedState,
        address[] calldata participants // length == 2!
    )
        external
        pure
        returns (address)
    {
        return participants[
            abi.decode(encodedState, (AppState)).turnNum % 2
        ];
    }

    function isStateTerminal(bytes calldata encodedState)
        external
        pure
        returns (bool)
    {
        AppState memory state = abi.decode(encodedState, (AppState));
        return state.finalized;
    }
}
