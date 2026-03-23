import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(JSON.stringify({ exists: false }));
  }

  const metrics = await prisma.userMetrics.findUnique({
    where: { userId }
  });

  if (!metrics) {
    return new Response(JSON.stringify({ exists: false }));
  }

  return new Response(JSON.stringify({
    exists: true,
    closeRate: metrics.closeRate,
    personalBestDelay: metrics.bestDelay,
    suppress: metrics.closeRate > 0.7
  }));
};