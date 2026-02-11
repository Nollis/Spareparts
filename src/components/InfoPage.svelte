<script>
    export let language = "se";

    const copy = {
        se: {
            title: "Information",
            phone: "Kontakta oss på tel: 0372-156 05.",
            email: "Eller e-post:",
            instructions: "Användarinstruktioner",
            manuals:
                "Här hittar du manualer och guider för reservdelsportalen.",
            version: "© Swepac Spareparts Portal v.1.0.0",
        },
        en: {
            title: "Information",
            phone: "Contact us by phone: +46 372-156 05.",
            email: "Or email:",
            instructions: "User Instructions",
            manuals:
                "Here you will find manuals and guides for the spare parts portal.",
            version: "© Swepac Spareparts Portal v.1.0.0",
        },
        pl: {
            title: "Informacja",
            phone: "Skontaktuj się z nami telefonicznie: +46 372-156 05.",
            email: "Lub e-mail:",
            instructions: "Instrukcja obsługi",
            manuals:
                "Tutaj znajdziesz instrukcje i przewodniki po portalu części zamiennych.",
            version: "© Swepac Spareparts Portal v.1.0.0",
        },
    };

    $: t = copy[language] || copy.se;
</script>

<section class="info-page">
    <div class="container container--narrow">
        <article class="info-card">
            <header class="info-header">
                <h1>{t.title}</h1>
            </header>

            <div class="info-content">
                <p>{t.phone}</p>
                <p>
                    {t.email}
                    <a href="mailto:info@swepac.com">info@swepac.com</a>
                </p>

                <div class="divider"></div>

                <h3>{t.instructions}</h3>
                <p class="placeholder-text">
                    {t.manuals}
                </p>
            </div>

            <footer class="info-footer">
                <p>{t.version}</p>
            </footer>
        </article>
    </div>
</section>

<style>
    .info-page {
        padding: 60px 0;
        background: #f8f9fa;
        min-height: calc(100vh - 200px);
    }

    .container--narrow {
        max-width: 800px;
    }

    .info-card {
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        overflow: hidden;
    }

    .info-header {
        background: #212529;
        color: #fff;
        padding: 30px 40px;
    }

    .info-header h1 {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 700;
    }

    .info-content {
        padding: 40px;
        font-size: 1.1rem;
        line-height: 1.6;
        color: #444;
    }

    .info-content p {
        margin: 0 0 10px 0;
    }

    .info-content a {
        color: #2185d0;
        text-decoration: none;
        font-weight: 600;
    }

    .info-content a:hover {
        text-decoration: underline;
    }

    .divider {
        height: 1px;
        background: #eee;
        margin: 30px 0;
    }

    .info-content h3 {
        margin-top: 0;
        color: #212529;
        font-size: 1.25rem;
    }

    .placeholder-text {
        color: #888;
        font-style: italic;
    }

    .info-footer {
        padding: 24px 40px;
        background: #fdfdfd;
        border-top: 1px solid #f0f0f0;
        color: #999;
        font-size: 0.9rem;
        text-align: center;
    }
</style>
