
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use GET."
    });
  }

  return res.status(200).json({
    success: true,
    message: "Voltiva backend is running!",
    service: "Voltiva",
    status: "Ready for Paybeta integration",
    projectUrl: "https://voltiva-backend-9s0udzxn1-rolex-rich.vercel.app"
  });
}
