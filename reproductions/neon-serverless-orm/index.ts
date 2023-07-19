import 'dotenv/config'
import { PrismaClient } from './.prisma/client/edge'

async function main() {
  const prisma = new PrismaClient()

  const email = `user.${Date.now()}@prisma.io`
  await prisma.user.create({
    data: {
      email: email,
    },
  })
}

void main()
