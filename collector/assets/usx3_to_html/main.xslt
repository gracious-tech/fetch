<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xs="http://www.w3.org/2001/XMLSchema">
<!--
    Headings:
        h1  Reserved for apps
        h2  Multi-ch section    p.ms
        h3  Chapter             chapter
        h4  Section             p.s
        h5  Speaker             p.sp
        h6  Unused
-->

    <!-- Import additional templates -->
    <xsl:include href="control_chars.xslt" />
    <xsl:include href="ignore.xslt" />

    <!-- General output settings -->
    <xsl:output method="html" indent="no" use-character-maps="control_chars" />
    <xsl:strip-space elements="*"/>

    <!-- Doc root -->
    <xsl:template match="usx">
        <xsl:apply-templates />
    </xsl:template>

    <!-- Chapter markers (turn into heading with data prop) -->
    <xsl:template match="chapter">
        <h3 data-chapter="{@number}">
            <xsl:value-of select="@number" />
        </h3>
    </xsl:template>

    <!-- Verse markers -->
    <xsl:template match="verse[@sid]">
        <sup data-verse="{preceding::chapter[1]/@number}:{@number}">
            <xsl:value-of select="@number" />
        </sup>
    </xsl:template>
    <xsl:template match="verse[@eid]" /><!-- Don't need end marker -->

    <!-- Paragraph (blocks of content)
        Really these are more like <div> with the style attr determining if a heading/paragraph/etc
    -->
    <xsl:template match="para[@style='ms']|para[@style='ms1']|para[@style='ms2']|para[@style='ms3']|para[@style='ms4']|para[@style='mr']">
        <h2 class="fb-{@style}">
            <xsl:apply-templates />
        </h2>
    </xsl:template>
    <xsl:template match="para[@style='s']|para[@style='s1']|para[@style='s2']|para[@style='s3']|para[@style='s4']|para[@style='sr']|para[@style='r']">
        <h4 class="fb-{@style}">
            <xsl:apply-templates />
        </h4>
    </xsl:template>
    <xsl:template match="para[@style='sp']">
        <h5 class="fb-{@style}">
            <xsl:apply-templates />
        </h5>
    </xsl:template>
    <xsl:template match="para">
        <p class="fb-{@style}">
            <xsl:apply-templates />
        </p>
    </xsl:template>

    <!-- Char content (styles a span of chars/words)

    Some of these may not be applicable (e.g. excluded with certain <para> types)
    Simply adding class with matching USX style and handing over for CSS to handle or ignore

    TODO These styles may need data attributes added: rb@gloss, w@lemma/srcloc, jmp

    -->
    <xsl:template match="char">
        <span class="fb-{@style}">

            <!-- Add data attribute if @strong property exists for char[@style='w'] elements -->
            <xsl:if test="@strong">
                <xsl:attribute name="data-strong"><xsl:value-of select="@strong" /></xsl:attribute>
            </xsl:if>

            <xsl:apply-templates />
        </span>
    </xsl:template>

    <!-- Notes -->
    <xsl:template match="note">
        <span class="fb-note">*
            <span><!-- Single child span that will contain notes' contents -->
                <xsl:apply-templates />
            </span>
        </span>
    </xsl:template>

    <!-- References to other parts of scripture -->
    <xsl:template match="ref">
        <span data-ref="{@loc}">
            <xsl:apply-templates />
        </span>
    </xsl:template>

    <!-- Default to including anything else in a <span> (but should handle when detected) -->
    <xsl:template match="node()">
        <span class="fb-unknown">
            <xsl:apply-templates />
        </span>
    </xsl:template>

    <!-- Copy plain text as is -->
    <xsl:template match="text()">
        <xsl:copy />
    </xsl:template>

</xsl:stylesheet>
