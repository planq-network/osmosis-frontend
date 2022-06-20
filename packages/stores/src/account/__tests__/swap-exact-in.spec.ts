/* eslint-disable */
import {
  chainId,
  deepContained,
  getEventFromTx,
  RootStore,
  waitAccountLoaded,
} from "../../__tests__/test-env";
import { Dec, DecUtils, Int, IntPretty, Coin } from "@keplr-wallet/unit";
import { WeightedPoolEstimates } from "@osmosis-labs/math";

jest.setTimeout(60000);

describe("Test Osmosis Swap Exact Amount In Tx", () => {
  let { accountStore, queriesStore } = new RootStore();
  let poolId: string | undefined;

  beforeEach(async () => {
    const account = accountStore.getAccount(chainId);
    account.cosmos.broadcastMode = "block";
    await waitAccountLoaded(account);

    // And prepare the pool
    await new Promise<any>((resolve, reject) => {
      account.osmosis
        .sendCreatePoolMsg(
          "0",
          [
            {
              weight: "100",
              token: {
                currency: {
                  coinDenom: "ION",
                  coinMinimalDenom: "uion",
                  coinDecimals: 6,
                },
                amount: "100",
              },
            },
            {
              weight: "200",
              token: {
                currency: {
                  coinDenom: "OSMO",
                  coinMinimalDenom: "uosmo",
                  coinDecimals: 6,
                },
                amount: "100",
              },
            },
          ],
          "",
          (tx) => {
            resolve(tx);
          }
        )
        .catch(reject);
    });

    // refresh stores
    await queriesStore
      .get(chainId)
      .osmosis!.queryGammNumPools.waitFreshResponse();
    await queriesStore.get(chainId).osmosis!.queryGammPools.waitFreshResponse();

    // set poolId
    const numPools =
      queriesStore.get(chainId).osmosis!.queryGammNumPools.numPools;
    poolId = numPools.toString();
  });

  test("should fail with unregistered pool asset", async () => {
    const account = accountStore.getAccount(chainId);

    await expect(
      account.osmosis.sendSwapExactAmountInMsg(
        poolId!,
        {
          currency: {
            coinDenom: "ION",
            coinMinimalDenom: "uion",
            coinDecimals: 6,
          },
          amount: "10",
        },
        {
          coinDenom: "BAR",
          coinMinimalDenom: "ubar",
          coinDecimals: 6,
        }
      )
    ).rejects.not.toBeNull();
  });

  test("should fail with unregistered pool asset (2)", async () => {
    const account = accountStore.getAccount(chainId);

    await expect(
      account.osmosis.sendSwapExactAmountInMsg(
        poolId!,
        {
          currency: {
            coinDenom: "BAR",
            coinMinimalDenom: "ubar",
            coinDecimals: 6,
          },
          amount: "10",
        },
        {
          coinDenom: "ATOM",
          coinMinimalDenom: "uatom",
          coinDecimals: 6,
        }
      )
    ).rejects.not.toBeNull();
  });

  test("with no max slippage", async () => {
    const account = accountStore.getAccount(chainId);

    const tokenIn = {
      currency: {
        coinDenom: "ION",
        coinMinimalDenom: "uion",
        coinDecimals: 6,
      },
      amount: "1",
    };
    const tokenOutCurrency = {
      coinDenom: "OSMO",
      coinMinimalDenom: "uosmo",
      coinDecimals: 6,
    };

    const queryPool = queriesStore
      .get(chainId)
      .osmosis!.queryGammPools.getPool(poolId!)!;
    await queryPool.waitFreshResponse();
    const inPoolAsset = queryPool.getPoolAsset(
      tokenIn.currency.coinMinimalDenom
    );
    const outPoolAsset = queryPool.getPoolAsset(
      tokenOutCurrency.coinMinimalDenom
    );
    const estimated = WeightedPoolEstimates.estimateSwapExactAmountIn(
      {
        inPoolAsset: {
          ...inPoolAsset.amount.currency,
          amount: new Int(inPoolAsset.amount.toCoin().amount),
          weight: inPoolAsset.weight.locale(false).toDec().truncate(),
        },
        outPoolAsset: {
          amount: new Int(outPoolAsset.amount.toCoin().amount),
          weight: outPoolAsset.weight.locale(false).toDec().truncate(),
        },
        swapFee: queryPool.swapFee.toDec(),
      },
      new Coin(
        tokenIn.currency.coinMinimalDenom,
        new Dec(tokenIn.amount)
          .mul(
            DecUtils.getTenExponentNInPrecisionRange(
              tokenIn.currency.coinDecimals
            )
          )
          .truncate()
          .toString()
      ),
      tokenOutCurrency
    );

    const tx = await new Promise<any>((resolve, reject) => {
      account.osmosis
        .sendSwapExactAmountInMsg(
          poolId!,
          tokenIn,
          tokenOutCurrency,
          "0",
          "",
          {},
          {},
          (tx) => {
            resolve(tx);
          }
        )
        .catch(reject);
    });

    deepContained(
      {
        type: "message",
        attributes: [
          {
            key: "action",
            value: "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn",
          },
          { key: "module", value: "gamm" },
          {
            key: "sender",
            value: account.bech32Address,
          },
        ],
      },
      getEventFromTx(tx, "message")
    );

    deepContained(
      {
        type: "transfer",
        attributes: [
          { key: "amount", value: "1000000uion" },
          {
            key: "amount",
            value:
              estimated.tokenOut
                .toDec()
                .mul(
                  DecUtils.getTenExponentNInPrecisionRange(
                    tokenOutCurrency.coinDecimals
                  )
                )
                .truncate()
                .toString() + tokenOutCurrency.coinMinimalDenom,
          },
        ],
      },
      getEventFromTx(tx, "transfer")
    );
  });

  test("with slippage", async () => {
    const account = accountStore.getAccount(chainId);

    const tokenIn = {
      currency: {
        coinDenom: "ION",
        coinMinimalDenom: "uion",
        coinDecimals: 6,
      },
      amount: "1",
    };
    const tokenOutCurrency = {
      coinDenom: "OSMO",
      coinMinimalDenom: "uosmo",
      coinDecimals: 6,
    };

    const queryPool = queriesStore
      .get(chainId)
      .osmosis!.queryGammPools.getPool(poolId!)!;
    await queryPool.waitFreshResponse();
    const inPoolAsset = queryPool.getPoolAsset(
      tokenIn.currency.coinMinimalDenom
    );
    const outPoolAsset = queryPool.getPoolAsset(
      tokenOutCurrency.coinMinimalDenom
    );
    const estimated = WeightedPoolEstimates.estimateSwapExactAmountIn(
      {
        inPoolAsset: {
          ...inPoolAsset.amount.currency,
          amount: new Int(inPoolAsset.amount.toCoin().amount),
          weight: inPoolAsset.weight.locale(false).toDec().truncate(),
        },
        outPoolAsset: {
          amount: new Int(outPoolAsset.amount.toCoin().amount),
          weight: outPoolAsset.weight.locale(false).toDec().truncate(),
        },
        swapFee: queryPool.swapFee.toDec(),
      },
      new Coin(
        tokenIn.currency.coinMinimalDenom,
        new Dec(tokenIn.amount)
          .mul(
            DecUtils.getTenExponentNInPrecisionRange(
              tokenIn.currency.coinDecimals
            )
          )
          .truncate()
          .toString()
      ),
      tokenOutCurrency
    );

    const doubleSlippage = new IntPretty(
      estimated.slippage.toDec().mul(new Dec(2))
    )
      .locale(false)
      .maxDecimals(4)
      .trim(true);

    expect(doubleSlippage.toDec().gt(new Dec(0))).toBeTruthy();

    const tx = await new Promise<any>((resolve, reject) => {
      account.osmosis
        .sendSwapExactAmountInMsg(
          poolId!,
          tokenIn,
          tokenOutCurrency,
          doubleSlippage.toString(),
          "",
          {},
          {},
          (tx) => {
            resolve(tx);
          }
        )
        .catch(reject);
    });

    deepContained(
      {
        type: "message",
        attributes: [
          {
            key: "action",
            value: "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn",
          },
          { key: "module", value: "gamm" },
          {
            key: "sender",
            value: account.bech32Address,
          },
        ],
      },
      getEventFromTx(tx, "message")
    );

    deepContained(
      {
        type: "transfer",
        attributes: [
          { key: "amount", value: "1000000uion" },
          {
            key: "amount",
            value:
              estimated.tokenOut
                .toDec()
                .mul(
                  DecUtils.getTenExponentNInPrecisionRange(
                    tokenOutCurrency.coinDecimals
                  )
                )
                .truncate()
                .toString() + tokenOutCurrency.coinMinimalDenom,
          },
        ],
      },
      getEventFromTx(tx, "transfer")
    );
  });

  test("with exactly matched slippage and max slippage", async () => {
    const account = accountStore.getAccount(chainId);

    const tokenIn = {
      currency: {
        coinDenom: "ION",
        coinMinimalDenom: "uion",
        coinDecimals: 6,
      },
      amount: "1",
    };
    const tokenOutCurrency = {
      coinDenom: "OSMO",
      coinMinimalDenom: "uosmo",
      coinDecimals: 6,
    };

    const queryPool = queriesStore
      .get(chainId)
      .osmosis!.queryGammPools.getPool(poolId!)!;
    await queryPool.waitFreshResponse();
    const inPoolAsset = queryPool.getPoolAsset(
      tokenIn.currency.coinMinimalDenom
    );
    const outPoolAsset = queryPool.getPoolAsset(
      tokenOutCurrency.coinMinimalDenom
    );
    const estimated = WeightedPoolEstimates.estimateSwapExactAmountIn(
      {
        inPoolAsset: {
          ...inPoolAsset.amount.currency,
          amount: new Int(inPoolAsset.amount.toCoin().amount),
          weight: inPoolAsset.weight.locale(false).toDec().truncate(),
        },
        outPoolAsset: {
          amount: new Int(outPoolAsset.amount.toCoin().amount),
          weight: outPoolAsset.weight.locale(false).toDec().truncate(),
        },
        swapFee: queryPool.swapFee.toDec(),
      },
      new Coin(
        tokenIn.currency.coinMinimalDenom,
        new Dec(tokenIn.amount)
          .mul(
            DecUtils.getTenExponentNInPrecisionRange(
              tokenIn.currency.coinDecimals
            )
          )
          .truncate()
          .toString()
      ),
      tokenOutCurrency
    );

    expect(estimated.slippage.toDec().gt(new Dec(0))).toBeTruthy();

    const tx = await new Promise<any>((resolve, reject) => {
      account.osmosis
        .sendSwapExactAmountInMsg(
          poolId!,
          tokenIn,
          tokenOutCurrency,
          estimated.slippage.maxDecimals(18).toString(),
          "",
          {},
          {},
          (tx) => {
            resolve(tx);
          }
        )
        .catch(reject);
    });

    deepContained(
      {
        type: "message",
        attributes: [
          {
            key: "action",
            value: "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn",
          },
          { key: "module", value: "gamm" },
          {
            key: "sender",
            value: account.bech32Address,
          },
        ],
      },
      getEventFromTx(tx, "message")
    );

    deepContained(
      {
        type: "transfer",
        attributes: [
          { key: "amount", value: "1000000uion" },
          {
            key: "amount",
            value:
              estimated.tokenOut
                .toDec()
                .mul(
                  DecUtils.getTenExponentNInPrecisionRange(
                    tokenOutCurrency.coinDecimals
                  )
                )
                .truncate()
                .toString() + tokenOutCurrency.coinMinimalDenom,
          },
        ],
      },
      getEventFromTx(tx, "transfer")
    );
  });

  test("should fail with more max slippage than calculated slippage", async () => {
    const account = accountStore.getAccount(chainId);

    const tokenIn = {
      currency: {
        coinDenom: "ION",
        coinMinimalDenom: "uion",
        coinDecimals: 6,
      },
      amount: "1",
    };
    const tokenOutCurrency = {
      coinDenom: "OSMO",
      coinMinimalDenom: "uosmo",
      coinDecimals: 6,
    };

    const queryPool = queriesStore
      .get(chainId)
      .osmosis!.queryGammPools.getPool(poolId!)!;
    await queryPool.waitFreshResponse();
    const inPoolAsset = queryPool.getPoolAsset(
      tokenIn.currency.coinMinimalDenom
    );
    const outPoolAsset = queryPool.getPoolAsset(
      tokenOutCurrency.coinMinimalDenom
    );

    const estimated = WeightedPoolEstimates.estimateSwapExactAmountIn(
      {
        inPoolAsset: {
          ...inPoolAsset.amount.currency,
          amount: new Int(inPoolAsset.amount.toCoin().amount),
          weight: inPoolAsset.weight.locale(false).toDec().truncate(),
        },
        outPoolAsset: {
          amount: new Int(outPoolAsset.amount.toCoin().amount),
          weight: outPoolAsset.weight.locale(false).toDec().truncate(),
        },
        swapFee: queryPool.swapFee.toDec(),
      },
      new Coin(
        tokenIn.currency.coinMinimalDenom,
        new Dec(tokenIn.amount)
          .mul(
            DecUtils.getTenExponentNInPrecisionRange(
              tokenIn.currency.coinDecimals
            )
          )
          .truncate()
          .toString()
      ),
      tokenOutCurrency
    );

    const added = new IntPretty(estimated.slippage.toDec().sub(new Dec("0.01")))
      .locale(false)
      .maxDecimals(4);

    expect(estimated.slippage.toDec().gt(new Dec(0))).toBeTruthy();
    expect(added.toDec().gt(new Dec(0))).toBeTruthy();

    await expect(
      new Promise<any>((resolve, reject) => {
        account.osmosis
          .sendSwapExactAmountInMsg(
            poolId!,
            tokenIn,
            tokenOutCurrency,
            added.toString(),
            "",
            {},
            {},
            (tx) => {
              resolve(tx);
            }
          )
          .catch(reject);
      })
    ).rejects.not.toBeNull();
  });
});
