// ADD THIS to your existing backend/src/routes/admin.js

// POST /api/admin/appeals/:submissionId/resolve
router.post('/appeals/:submissionId/resolve', authMiddleware, async (req, res) => {
  // TODO: add admin role check here
  const { resolution, overrideStatus } = req.body;
  const submission = await Submission.findById(req.params.submissionId);

  if (!submission || !submission.disputed) {
    return res.status(404).json({ error: 'No active appeal found' });
  }

  submission.disputeResolution = resolution;
  if (overrideStatus) {
    submission.status = overrideStatus;
    if (overrideStatus === 'approved') {
      // await blockchain.verifyTask(submission.userAddress, submission.taskId, ...);
    }
  }
  await submission.save();

  if (resolution === 'overturned') {
    await User.updateOne(
      { walletAddress: submission.userAddress },
      { $inc: { strikes: -1 } }
    );
  }

  res.json({ success: true, message: `Appeal ${resolution}` });
});
