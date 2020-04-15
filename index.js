const got = require('got')
const STOCK_API_KEY = process.env.STOCK_API_KEY
const fs = require('fs')

function getAlphaVantageURL(symbol) {
  symbol = encodeURIComponent(symbol)
  return `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=1min&apikey=${STOCK_API_KEY}`
}

const stocks = JSON.parse(fs.readFileSync('stocks.json'))

const TODAY = '2020-04-14'

const doThings = async () => {
  const SCHG = {}
  const SCHGData = await got(
    'https://financialmodelingprep.com/api/v3/historical-price-full/SCHG'
  ).json()
  SCHGData.historical.forEach((day) => (SCHG[day.date] = day.close))

  for (stock of stocks) {
    const { symbol, shares, date, cost } = stock
    const results = await got(getAlphaVantageURL(symbol)).json()
    const close = results['Time Series (1min)'][`${TODAY} 16:00:00`]['4. close']
    stock.gain = (close - stock.cost) * shares
    stock.costBasis = shares * cost
    const sharesOfSCHG = stock.costBasis / SCHG[date]
    stock.schgGain = sharesOfSCHG * SCHG[TODAY] - stock.costBasis
    stock.delta = stock.gain - stock.schgGain
    const schgPercent = (SCHG[TODAY] - SCHG[date]) / SCHG[date]
    const percent = (close - cost) / cost
    stock.percentDelta = ((percent - schgPercent) * 100).toFixed(2)
    delete stock.shares
    delete stock.cost
    delete stock.date
    console.log({ stock })
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

doThings()
