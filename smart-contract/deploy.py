from algosdk.future import transaction
from algosdk import account, mnemonic
from algosdk.v2client import algod
from pyteal import compileTeal, Mode

from secrets import account_mnemonics, algod_address, algod_headers
from election_params import local_ints, local_bytes, global_ints, global_bytes, \
    relative_election_end, num_vote_options, vote_options
from helper import wait_for_confirmation, compile_program, read_global_state, int_to_bytes
from election_smart_contract import approval_program, clear_state_program

# Define keys, addresses, and token
account_private_keys = [mnemonic.to_private_key(mn) for mn in account_mnemonics]
account_addresses = [account.address_from_private_key(sk) for sk in account_private_keys]

# Declare application state storage for local and global schema
global_schema = transaction.StateSchema(global_ints, global_bytes)
local_schema = transaction.StateSchema(local_ints, local_bytes)


def create_app(client, private_key, approval_program, clear_program, global_schema, local_schema, app_args):
    """
    Create a new application from the compiled approval_program, clear_program
    using the application arguments app_args
    Return the newly created application ID
    """
    # define sender as creator
    sender = account.address_from_private_key(private_key)
    # declare the on_complete transaction as a NoOp transaction
    on_complete = transaction.OnComplete.NoOpOC.real
    # get node suggested parameters
    params = client.suggested_params()
    # create unsigned transaction
    txn = transaction.ApplicationCreateTxn(sender, params, on_complete,
                                           approval_program, clear_program,
                                           global_schema, local_schema,
                                           app_args)
    # sign transaction
    signed_txn = txn.sign(private_key)
    tx_id = signed_txn.transaction.get_txid()
    # send transaction
    client.send_transactions([signed_txn])
    # await confirmation
    wait_for_confirmation(client, tx_id)

    # display results
    transaction_response = client.pending_transaction_info(tx_id)
    app_id = transaction_response["application-index"]
    print("Created new app-id:", app_id)

    return app_id


def create_vote_app(client, creator_private_key, election_end, num_vote_options, vote_options):
    """
    Create/Deploy the voting app
    This function uses create_app and return the newly created application ID
    """
    # Get PyTeal approval program
    # compile program to TEAL assembly
    approval_teal = compileTeal(approval_program(), mode=Mode.Application, version=5)
    # compile program to binary
    approval_program_bin = compile_program(client, approval_teal)

    # Do the same for PyTeal clear state program
    clear_teal = compileTeal(clear_state_program(), mode=Mode.Application, version=5)
    clear_state_bin = compile_program(client, clear_teal)

    # TODO: Create list of bytes for application arguments and create new application. 
    app_args = [int_to_bytes(election_end), int_to_bytes(num_vote_options), vote_options]

    app_id = create_app(client, creator_private_key,
                        approval_program_bin, clear_state_bin,
                        global_schema, local_schema,
                        app_args)

    return app_id


def main():
    # Initialize algod client
    client = algod.AlgodClient(
        algod_token="",
        algod_address=algod_address,
        headers=algod_headers
    )

    #  define absolute election end time fom the status of the last round
    last_round = client.status().get("last-round")
    election_end = last_round + relative_election_end

    # Deploy the app and print the global state
    app_id = create_vote_app(client, account_private_keys[0], election_end, num_vote_options, vote_options)

    # read global state of application
    print("Global state:", read_global_state(client, app_id))


if __name__ == "__main__":
    main()
