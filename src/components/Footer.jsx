import Link from "next/link"

const Footer = () => {
  return (
    <footer className="border-t py-6">
      <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
        <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
          © {new Date().getFullYear()} Sebastian Samaniego.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            Admin
          </Link>
          <Link href="/secretary" className="text-sm text-muted-foreground hover:underline">
            Secretaría
          </Link>
          <Link href="/group" className="text-sm text-muted-foreground hover:underline">
            Grupos
          </Link>
        </div>
      </div>
    </footer>
  )
}

export default Footer
