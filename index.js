const got = require('got')
const STOCK_API_KEY = process.env.STOCK_API_KEY || '46M8G4YUYCHFIAV8'
const INDEX_SYMBOL = process.env.INDEX_SYMBOL || 'SCHG' // Index fund to compare to
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'
const fs = require('fs')
const { promisify } = require('util')
const sleep = promisify(setTimeout)

if (LOG_LEVEL === 'info') console.debug = () => {}

function getAlphaVantageURL(symbol) {
  symbol = encodeURIComponent(symbol)
  return `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=1min&apikey=${STOCK_API_KEY}`
}

const stocks = JSON.parse(fs.readFileSync('stocks.json'))

const latestStockData = async (symbol) => {
  let results
  try {
    results = await got(getAlphaVantageURL(symbol)).json()
  } catch (err) {
    console.error(`Error fetching ${symbol}`, err)
    process.exit(1)
  }
  if (results.Note && results.Note.includes('Our standard API call frequency')) {
    const delay = 60
    console.debug(`Hit API ratelimit. Continuing after ${delay}s.`)
    await sleep(delay * 1000)
    return await latestStockData(symbol)
  }
  const lastRefreshed = results['Meta Data']['3. Last Refreshed']
  const close = results['Time Series (1min)'][lastRefreshed]['4. close']
  return { lastRefreshed, close }
}

const main = async () => {
  console.log(`Comparing portfolio to ${INDEX_SYMBOL}.`)
  const INDEX = {}
  const INDEXData = await got(
    `https://financialmodelingprep.com/api/v3/historical-price-full/${INDEX_SYMBOL}`
  ).json()
  INDEXData.historical.forEach((day) => (INDEX[day.date] = day.close))
  const { lastRefreshed, close: INDEXLatest } = await latestStockData(INDEX_SYMBOL)
  console.log(
    `Latest ${INDEX_SYMBOL} was $${parseFloat(INDEXLatest).toFixed(2)} @ ${lastRefreshed}`
  )

  console.log(
    [
      'STOCK',
      'Last Refreshed'.padEnd(19),
      `Δ over ${INDEX_SYMBOL}`.padStart(11),
      'Δ G/L%'.padStart(7),
    ].join(' | ')
  )

  for (stock of stocks) {
    const { symbol, shares, date, cost } = stock
    const { lastRefreshed, close } = await latestStockData(symbol)
    stock.gain = (close - stock.cost) * shares
    stock.costBasis = shares * cost
    const sharesOfSCHG = stock.costBasis / INDEX[date]
    stock.schgGain = sharesOfSCHG * INDEXLatest - stock.costBasis
    stock.delta = stock.gain - stock.schgGain
    const schgPercent = (INDEXLatest - INDEX[date]) / INDEX[date]
    const percent = (close - cost) / cost
    stock.percentDelta = ((percent - schgPercent) * 100).toFixed(2)
    delete stock.shares
    delete stock.cost
    delete stock.date
    console.log(
      [
        symbol.padEnd(5),
        lastRefreshed,
        stock.delta.toFixed(2).padStart(11),
        stock.percentDelta.padStart(6) + '%',
      ].join(' | ')
    )
  }

  const overallGain = stocks.map((stock) => stock.gain).reduce((a, b) => a + b, 0)
  const overallSchgGain = stocks.map((stock) => stock.schgGain).reduce((a, b) => a + b, 0)
  const overallDelta = stocks.map((stock) => stock.delta).reduce((a, b) => a + b, 0)

  console.log(
    `OVERALL Gain: ${overallGain.toFixed(2)} | SCHG Gain: ${overallSchgGain.toFixed(
      2
    )} | Delta: ${overallDelta.toFixed(2)} | +${(
      ((overallGain - overallSchgGain) / overallSchgGain) *
      100
    ).toFixed()}%`
  )
}

main()
