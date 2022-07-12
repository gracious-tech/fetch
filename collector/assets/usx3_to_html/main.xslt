<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<!-- Transform USX3 to fetch(bible) HTML

    Methodology:
        Stay close to USX3, so keep class names matching USX styles
        Prefix all classes with 'fb-' so an app's CSS less likely to affect fetch(bible) content
        Try to be semantic but not excessively, e.g. use <h4 class='fb-s'> not <p class='fb-s'>
        Try keep small (especially common elements), so data-v='' rather than data-verse=''
            Inline with that, if can match by sup[data-v] then don't worry about adding class too

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

    <!-- Doc root -->
    <xsl:template match="usx">
        <xsl:apply-templates />
    </xsl:template>

    <!-- Chapter markers (turn into heading with data prop) -->
    <xsl:template match="chapter[@sid]">
        <h3 data-c="{@number}">
            <xsl:value-of select="@number" />
        </h3>
    </xsl:template>
    <xsl:template match="chapter[@eid]" /><!-- Don't need end marker -->

    <!-- Verse markers -->
    <xsl:template match="verse[@sid]">
        <sup data-v="{preceding::chapter[1]/@number}:{@number}">
            <xsl:value-of select="@number" />
        </sup>
    </xsl:template>
    <!-- WARN BibleMultiConverter doesn't always output end markers!
        Don't currently need them anyway, but see:
            https://github.com/schierlm/BibleMultiConverter/issues/65
    -->
    <xsl:template match="verse[@eid]" />

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

    <!-- Char content (styles a span of chars/words) -->
    <xsl:template match="char[@style='w']">
        <!-- Handle chars for adding meta data to a span of text -->
        <xsl:choose>
            <!-- If there's a strong code, preserve it in a data attribute -->
            <xsl:when test="@strong">
                <span data-s="{@strong}">
                    <xsl:apply-templates />
                </span>
            </xsl:when>
            <!-- Ignore @lemma as can generate own search index without it -->
            <!-- TODO Ignoring @srcloc unless useful in future -->
            <xsl:otherwise>
                <!-- Exclude the span to save space as meaningless if no data to preserve -->
                <xsl:apply-templates />
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    <xsl:template match="char[@style='rb']">
        <!-- Ruby text (used by Japanese etc) -->
        <ruby>
            <rb><xsl:apply-templates /></rb>
            <!-- Gloss chars may be separated by colons for reasons we can ignore, but must strip them -->
            <rt><xsl:value-of select="translate(@gloss, ':', '')" /></rt>
        </ruby>
    </xsl:template>
    <xsl:template match="char[@style='ord']|char[@style='sup']">
        <!-- The 'st' in 1st OR superscript in general -->
        <sup><xsl:apply-templates /></sup>
    </xsl:template>
    <xsl:template match="char">
        <!-- Various other types that just need a class to style them -->
        <span class="fb-{@style}">
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
        <span data-r="{@loc}">
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
