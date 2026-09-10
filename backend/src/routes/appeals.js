const express = require('express')
const router = express.Router()
const Submission = require('../models/Submission')
const User = require('../models/User')
const { authMiddleware } = require('../middleware/auth')
const logger = require('../utils/logger')

// POST /api/appeals/:submissionId
router.post('/:submissionId', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body
    const submission = await Submission.findOne({
      _id: req.params.submissionId,
      userAddress: req.user.walletAddress
    })

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' })
    }

    if (submission.status !== 'rejected') {
      return res.status(400).json({ error: 'Only rejected submissions can be appealed' })
    }

    if (submission.disputed) {
      return res.status(400).json({ error: 'Already appealed' })
    }

    const reviewedAt = submission.reviewedAt || submission.createdAt
    if (Date.now() - new Date(reviewedAt).getTime() > 7 * 86400000) {
      return res.status(400).json({ error: 'Appeal window expired (7 days)' })
    }

    submission.disputed = true
    submission.disputeReason = reason
    submission.status = 'disputed'
    await submission.save()

    logger.info(`Appeal filed: ${submission._id} by ${req.user.walletAddress}`)

    res.json({ success: true, message: 'Appeal submitted for review' })
  } catch (error) {
    logger.error(`Appeal error: ${error.message}`)
    res.status(500).json({ error: 'Failed to submit appeal' })
  }
})

// GET /api/appeals/my
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const appeals = await Submission.find({
      userAddress: req.user.walletAddress,
      disputed: true
    })
    .sort({ createdAt: -1 })
    .select('taskId status disputed disputeReason disputeResolution reviewedAt verificationScore verificationNotes')

    res.json({ appeals })
  } catch (error) {
    logger.error(`Fetch appeals error: ${error.message}`)
    res.status(500).json({ error: 'Failed to fetch appeals' })
  }
})

module.exports = router
