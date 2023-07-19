import 'dotenv/config'
import { PrismaClient } from './.prisma/client'

async function main() {
  const prisma = new PrismaClient()

  const email = `user.${Date.now()}@prisma.io`
  await prisma.user.create({
    data: {
      email: email,
    },
  })

  let res = await prisma.user.findMany()
  console.log("findMany Result:")
  console.log(res)
}

void main()
