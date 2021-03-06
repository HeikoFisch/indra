pragma solidity 0.5.11;
pragma experimental "ABIEncoderV2";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "../adjudicator/interfaces/CounterfactualApp.sol";
import "../funding/libs/LibOutcome.sol";


/// @title Simple Signed Transfer App
/// @notice This contract allows users to claim a payment locked in
///         the application if the specified signed submits the correct
///         signature for the provided data
contract SimpleSignedTransferApp is CounterfactualApp {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    struct AppState {
        LibOutcome.CoinTransfer[2] coinTransfers;
        address signer;
        bytes32 paymentId;
        bool finalized;
    }

    struct Action {
        bytes32 data;
        bytes signature;
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

        require(!state.finalized, "Cannot take action on finalized state");
        bytes32 rawHash = keccak256(abi.encodePacked(action.data, state.paymentId));
        require(state.signer == rawHash.recover(action.signature), "Incorrect signer recovered from signature");

        state.coinTransfers[1].amount = state.coinTransfers[0].amount;
        state.coinTransfers[0].amount = 0;
        state.finalized = true;

        return abi.encode(state);
    }

    function computeOutcome(bytes calldata encodedState)
        external
        view
        returns (bytes memory)
    {
        AppState memory state = abi.decode(encodedState, (AppState));

        return abi.encode(state.coinTransfers);
    }

    function getTurnTaker(
        bytes calldata encodedState,
        address[] calldata participants
    )
        external
        view
        returns (address)
    {
        return participants[1]; // receiver should always be indexed at [1]
    }

    function isStateTerminal(bytes calldata encodedState)
        external
        view
        returns (bool)
    {
        AppState memory state = abi.decode(encodedState, (AppState));
        return state.finalized;
    }
}
