console.log("🔥 CREATEDISCOUNT FILE HIT");
export async function action() {
  const res = await fetch("https://rush-drinking-elder-flickr.trycloudflare.com/create-discount", {
    method: "POST"
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
}

export const loader = action;