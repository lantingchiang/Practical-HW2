import { encodeUint64 } from "algosdk";

let secrets = {};
try {
    secrets = require("./secrets").secrets; // create your secrets.js file using the template
} catch {
    console.log("You need to setup frontend/src/utils/secrets.js using the secrets.template.js file");
    alert("You need to setup frontend/src/utils/secrets.js using the secrets.template.js file");
}

const algosdk = require("algosdk");

// This will handle all algosdk, indexer, and AlgoSigner code
class AlgoHandler {
    constructor() {
        // Waits a little while then checks to see if the AlgoSigner extension is installed
        setTimeout(200, () => {
            if (typeof window.AlgoSigner == "undefined") {
                console.log("Please install the AlgoSigner extension");
                alert("Please install the AlgoSigner extension");
                return;
            }
        });

        // https://developer.purestake.io/code-samples
        // Setup the algod client using the secrets imported variable
        this.algodClient = new algosdk.Algodv2(secrets.algodHeader, secrets.algodServer, "");

        // Setup the indexer client using the secrets imported variable
        this.indexerClient = new algosdk.Indexer(secrets.algodHeader, secrets.indexerServer, "");
    }

    /**
     * Attempts to connect to the accounts present in the browser's AlgoSigner addon.
     * https://github.com/PureStake/algosigner/blob/develop/docs/dApp-integration.md#algosignerconnect
     *
     * @returns {string[]} - array of all account addresses in string format.
     */
    async getAlgoSignerAccounts() {
        // This variable will be returned after populated
        let accounts = [];

        // Attempt to connect to AlgoSigner, note you will have to use the "await" keyword
        // If this fails or an error occurs, return an empty array
        try {
            await window.AlgoSigner.connect();
        } catch (e) {
            console.error("Can't connect to algosiner in getAlgoSignerAccounts: ", e);
            return accounts;
        }


        // Retrieve all the AlgoSigner accounts on the TestNet
        // Note they may be in this format: [{address: "address1"}, {address: "address2"}, etc]
        // TODO -----------------------------------------------------------------------------
        let accountData = [];
        try {
            accountData = await window.AlgoSigner.accounts({ ledger: 'TestNet' });
        } catch (e) {
            console.error("Can't get accounts from algosigner in getAlgoSignerAccounts: ", e);
            return accounts;
        }

        // Return the addresses in array format: ["address1", "address2", "address3", etc]
        try {
            for (let i = 0; i < accountData.length; i++) {
                accounts.push(accountData[i].address)
            }
        } catch (e) {
            console.error("Problem pushing account addresses to output array: ", e);
        }
        
        console.log("Accounts retrieved from AlgoSigner: ", accounts);

        return accounts;
    }

    /**
     * Decodes base64 string to JavaScript standard string.
     * 
     * @param {string} encodedString - string encoded in base64
     * @returns {string} - regular JavaScript string 
     */
    base64ToString(encodedString) {
        return Buffer.from(encodedString, "base64").toString();
    }

    /**
     * Retrieves and returns the last Algorand TestNet round
     * @returns {Number} - the last Algorand TestNet round
     */
    async getLatestRound() {
        // Retrieve the algod client status
        // Return the "last-round" value from that status
        try {
            let status = await this.algodClient.status().do();
            console.log("Client status retrieved in getLatestRound: ", status);
            return status["last-round"]
        } catch (e) {
            console.error("Caught error in getLatestRound: ", e);
        }

        return 0;
    }

    /** 
     * Retrieves and returns the current global variable values in the given app (appID).
     *
     * @param {number} appID - App ID (aka index) of the Algorand smart contract app.
     * @returns {object} - Javascript object of election variables mapped to their respective values.
     * 
     * @example 
     * // returns 
     * //   {
     * //     "Creator": "fjlasjfskfa...",
     * //     "VoteOptions": "A,B,C,D",
     * //     "VotesFor0": 0,
     * //     "VotesFor1": 0,
     * //     ...
     * //   } 
     * getElectionState(appID)
     */
    async getElectionState(appID) {
        // newState will be returned once it's filled with data
        let newState = {};

        // Use the algodClient to get the the app details
        try {
            let app = await this.algodClient.getApplicationByID(appID).do();
            // The data might have a complex structure, feel free to console.log it to see the structure

            // Go through the data and add the global state variables and values to our newState object (dictionary)
            console.log("Application retrieved by algodClient: ", app);
            if (app["params"] === undefined) {
                console.error("getElectionState retrieved application with no params field");
                return newState;
            }

            for (let x of app["params"]["global-state"]) {
                // Decode the object key
                let key = this.base64ToString(x["key"]);

                // Bytes values need to be decoded
                // Addresses stored as bytes need a special decoding process which we have done for you :)
                let bytesVal = this.base64ToString(x["value"]["bytes"]);

                // uint types don't need to be decoded
                let uintVal = x["value"]["uint"];

                // Type is 1 if the variable is the bytes value, 2 if the variable is actually the uint value
                let valType = x["value"]["type"];

                // set the value for the key in our newState object to the correct value
                newState[key] = valType === 1 ? bytesVal : uintVal;
            }

            // Add the creator's address
            newState["Creator"] = app["params"]["creator"];

        } catch (e) {
            console.error("Caught error in getElectionState: ", e);
        }

        // return the newState
        console.log("getElectionState got new state: ", newState);
        return newState;
    }

    /** 
     * Finds all accounts that have opted-in to the specified app and returns their local states.
     *
     * @param {number} appID - App ID (aka index) of the Algorand smart contract app.
     * @returns {object} - Object of addresses mapped to an object of the addresses' key-value 
     * local state.
     * 
     * @example 
     * // returns 
     * //   {
     * //     "jsdalkfjsd...": {
     * //       "can_vote": "yes", 
     * //       "voted": 2
     * //     }, 
     * //     "fdsfdsaf...": {
     * //       "can_vote": "no"
     * //     }
     * //   }
     * getAllLocalStates(appID)
     */
    async getAllLocalStates(appID) {
        // allLocalStates will be returned once it's filled with data
        let allLocalStates = {};

        // Use this.indexerClient to find all the accounts who have appID associated with their account
        let accountInfo = {}
        try {
            accountInfo = await this.indexerClient.searchAccounts()
                .applicationID(appID).do();
            console.log("Account info retrieved by indexerClient in getAllLocalStates: ", accountInfo);
        } catch (e) {
            console.error("getAllLocalStates: ", e);
            return allLocalStates;
        }

        // The resultant JavaScript object (dictionary) may have a complex structure
        // Try to console.log it out to see the structure

        // Go through the data and fill allLocalStates to contain all the users' local states
        // Note that the *keys* of smart contract local state variables will need to be decoded using
        // our this.base64ToString(value) function
        // The actual values will also need to be decoded if they are bytes
        // If they are uints they do not need decoding

        let accounts = accountInfo['accounts'];
        for (let i = 0; i < accounts.length; i++) {
            let address = accounts[i]['address'];
            let accountInfoResponse = []
            try {
                accountInfoResponse = await this.algodClient.accountInformation(address).do();
                console.log("getAllLocalState got account info: ", accountInfoResponse);
            } catch (e) {
                console.error("Error retrieving account info in getAllLocalStates: ", e);
                continue;
            }

            // apps-local-state is array of local states
            for (let i = 0; i < accountInfoResponse['apps-local-state'].length; i++) {
                let localStateArr = accountInfoResponse['apps-local-state'][i];
                if (localStateArr.id === appID) {
                    // add mapping from account address to dictionary of local states
                    if (!(address in allLocalStates)) {
                        allLocalStates[address] = {}
                    }
                    // key-value is array of TealKeyValues (key = string, value = TealValue)
                    // TealValue contains type, bytes & uint field; if value is bytes type == 1
                    if (localStateArr['key-value'] !== undefined) {
                        for (let n = 0; n < localStateArr['key-value'].length; n++) {
                            let key = this.base64ToString(localStateArr['key-value'][n].key)
                            let tealVal = localStateArr['key-value'][n].value
                            // console.log("TealValue for key ", key, ": ", tealVal);
                            let val = "";
                            if (tealVal.type === 1) {
                                val = this.base64ToString(tealVal.bytes);
                            } else {
                                val = tealVal.uint;
                            }
                            allLocalStates[address][key] = val;
                            // console.log("Decoded value: ", val);
                        }
                    }
                }
            }
        }

        // Return your JavaScript object
        console.log("getAllLocalStates got the following state: ", allLocalStates);
        return allLocalStates;
    }

    /** 
     * Signs the given transaction using AlgoSigner then sends it out to be added to the blockchain.
     * https://github.com/PureStake/algosigner/blob/develop/docs/dApp-integration.md#algosignerconnect
     * 
     * @param {AlgoSDK Transaction} txn - Transaction that needs to be signed and sent.
     */
    async signAndSend(txn) {
        // Transactions will need to be encoded to Base64. AlgoSigner has a builtin method for this
        try {
            await window.AlgoSigner.connect();
        } catch (e) {
            console.error("signAndSend can't connect to algosigner: ", e);
            return;
        }
        
        let binaryTx = txn.toByte();
        let base64Tx = window.AlgoSigner.encoding.msgpackToBase64(binaryTx);

        // Sign the transaction with AlgoSigner
        let signedTx;
        try {
            signedTx = await window.AlgoSigner.signTxn([
                {
                    txn: base64Tx,
                },
            ]);
            console.log("Signed transaction of AlgoSigner: ", signedTx);
        } catch (e) {
            console.error("Unable to sign transaction with algosigner", e);
            return;
        }
        

        // Send the message with AlgoSigner
        try {
            let response = await window.AlgoSigner.send({
                ledger: 'TestNet',
                tx: signedTx[0].blob,
            });
            console.log("Response after sending transaction with AlgoSigner: ", response);
        } catch (e) {
            console.error("Errored when sending transaction with AlgoSigner: ", e);
        }
        
    }

    /** 
     * Sends a transaction that opts in the given account to the given app.
     * https://algorand.github.io/js-algorand-sdk/modules.html#makeApplicationOptInTxn
     * 
     * @param {string} address - Address of the user who wants to opt into the election.
     * @param {number} appID - App ID (aka index) of the smart contract app.
     */
    async optInAccount(address, appID) {
        // Get the suggested params for the transaction
        let params = await this.algodClient.getTransactionParams().do();

        // Create the transaction to opt in
        let txn = algosdk.makeApplicationOptInTxn(address, params, appID);
        console.log("Constructed Application OptIn transaction: ")
        console.log(txn);

        // Sign and send the transaction with our this.signAndSend function
        this.signAndSend(txn);
    }

    /** 
     * Sends a transaction from the creator to the given app to approve/reject the given user.
     * https://developer.algorand.org/docs/get-details/encoding/
     * https://algorand.github.io/js-algorand-sdk/modules.html#decodeAddress
     * https://developer.algorand.org/docs/get-details/dapps/smart-contracts/frontend/apps/#call-noop
     * 
     * 
     * @param {string} creatorAddress - Address of the creator, who is allowed to approve/reject.
     * @param {string} userAddress - Address of the user who is being approved/rejected.
     * @param {string} yesOrNo - "yes" or "no" corresponding to whether user should be allowed to vote 
     * or not.
     * @param {number} appID - App ID (aka index) of the smart contract app.
     */
    async updateUserStatus(creatorAddress, userAddress, yesOrNo, appID) {
        // Get the suggested params for the transaction
        let params = await this.algodClient.getTransactionParams().do();

        // Setup the application argument array, note that application arguments need to be encoded
        // Strings need to be encoded into Uint8Array
        // Addresses, *only* when passed as *arguments*, need to be decoded with algosdk inbuilt
        // decodeAddress function and have their public key value used
        // The first argument should be the identifier of the smart contract method.
        // In this case the identifier is "update_user_status"
        let args = []
        args.push(new Uint8Array(Buffer.from("update_user_status")));
        args.push(algosdk.decodeAddress(userAddress).publicKey);     // decodes into Uint8Array
        args.push(new Uint8Array(Buffer.from(yesOrNo)));           

        // Create the transaction with proper app argument array
        // For this application transaction make sure to include the optional array of accounts
        // including both the creator's account and also the user's account
        // (both in regular string format, algosdk automatically converts these when used this way)
        let txn = algosdk.makeApplicationNoOpTxn(creatorAddress, params, appID, args, [creatorAddress, userAddress]);
        console.log("Constructed update_user_status transaction: ");
        console.log(txn);
        
        // Sign and send the transaction with our this.signAndSend function
        this.signAndSend(txn);
    }

    /** 
     * Sends a transaction from the given user to vote for the given option in the given election app.
     * https://algorand.github.io/js-algorand-sdk/modules.html#encodeUint64
     *
     * @param {string} address - Address of the user trying to vote.
     * @param {number} optionIndex - Index (starting at 0) corresponding to the user's vote, 
     * ie in "A,B,C" the optionIndex for C would be index 2.
     * @param {number} appID - App ID (aka index) of the smart contract app.
     */
    async vote(address, optionIndex, appID) {
        // The first argument should be the identifier of the smart contract method.
        // In this case the identifier is "vote"
        let params = await this.algodClient.getTransactionParams().do();
        let args = [];
        args.push(new Uint8Array(Buffer.from("vote")));
        args.push(encodeUint64(optionIndex));

        let txn = algosdk.makeApplicationNoOpTxn(address, params, appID, args);
        console.log("Constructed vote transaction: ", txn);

        this.signAndSend(txn);
    }

    /** 
     * Sends a transaction from given account to close out of the given app.
     * https://developer.algorand.org/docs/get-details/dapps/smart-contracts/frontend/apps/#close-out
     *
     * @param {string} address - Address of the user trying to close out.
     * @param {number} appID - App ID (aka index) of the smart contract app.
     */
    async closeOut(address, appID) {
        let params = await this.algodClient.getTransactionParams().do();
        let txn = algosdk.makeApplicationCloseOutTxn(address, params, appID);
        console.log("Constructed closeOut transaction: ");
        console.log(txn);
        this.signAndSend(txn);
    }

    /** 
     * Sends a transaction from the given user to the given app to clear state of the app.
     *
     * @param {string} address - Address of the user trying to clear state.
     * @param {number} appID - App ID (aka index) of the smart contract app.
     */
    async clearState(address, appID) {
        let params = await this.algodClient.getTransactionParams().do();
        let txn = algosdk.makeApplicationClearStateTxn(address, params, appID);
        console.log("Constructed ClearState transaction: ");
        console.log(txn);
        this.signAndSend(txn);
    }
}

// create and export a singular AlgoHandler instance
const mainAlgoHandler = new AlgoHandler();

export default mainAlgoHandler;
